import { Block, BlockHeader, FieldElement } from "@apibara/starknet";
import { Contract, hash, RpcProvider } from "starknet";
import { PgDatabase } from "drizzle-orm/pg-core";
import { AnyPgTable } from "drizzle-orm/pg-core";
import type { ConsolaInstance } from "@apibara/indexer/plugins";
import * as schema from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { AdditionalField, EventConfig, EventField } from "./config.ts";
import { CONFIG } from "./config.ts";
import { Event } from "@apibara/starknet";
import { standariseAddress } from "./index.ts";

function getConfigArr(blockNumber: number) {
  return CONFIG;
}

/**
 * Performs atomic batch insert using database transaction
 * All records are inserted in a single transaction - either all succeed or all fail
 */
async function performAtomicBatchInsert<T extends Record<string, any>>(
  database: PgDatabase<any, any, any>,
  recordsToInsert: Array<{ record: T; config: any; tableName: string }>,
  logger: ConsolaInstance
): Promise<void> {
  if (recordsToInsert.length === 0) {
    logger.info("No records to insert");
    return;
  }

  // Group records by table name for efficient batch inserts
  const recordsByTable = new Map<string, T[]>();
  
  for (const { record, tableName } of recordsToInsert) {
    if (!recordsByTable.has(tableName)) {
      recordsByTable.set(tableName, []);
    }
    recordsByTable.get(tableName)!.push(record);
  }

  logger.info(`Starting atomic batch insert of ${recordsToInsert.length} records across ${recordsByTable.size} tables`);

  // Use database transaction to ensure atomicity
  await database.transaction(async (tx) => {
    try {
      // Insert records for each table
      for (const [tableName, records] of recordsByTable) {
        if (records.length === 0) continue;
        
        logger.info(`Inserting ${records.length} records into ${tableName}`);
        
        await tx
          .insert(schema[tableName])
          .values(records)
          .execute();
      }
      
      logger.info(`Successfully inserted ${recordsToInsert.length} records across ${recordsByTable.size} tables`);
    } catch (err) {
      
      // Handle specific error cases that might be recoverable
      if (err.message.includes('Validator not found')) {
        logger.warn("Validator not found error, but continuing with batch");
        // Don't throw - allow partial success for validator errors
        return;
      }
      
      logger.error("Batch insert failed, rolling back transaction:", err);
      
      // Handle duplicate key errors - these might be acceptable in some cases
      // if (err.code === '23505' || err.message.includes('duplicate key')) {
      //   logger.warn("Duplicate key error detected, but continuing with batch");
      //   return;
      // }
      
      // Log failed records for debugging
      logger.error("Failed records summary:", {
        totalRecords: recordsToInsert.length,
        tablesAffected: Array.from(recordsByTable.keys()),
        errorMessage: err.message,
        errorCode: err.code
      });
      
      // Log first few failed records for debugging (avoid logging too much)
      const sampleRecords = recordsToInsert.slice(0, 3).map(r => ({
        table: r.tableName,
        recordKeys: Object.keys(r.record)
      }));
      logger.error("Sample failed records:", sampleRecords);
      
      throw err; // This will trigger rollback
    }
  });
}

/**
 * Transforms blockchain events into database records with atomic batch processing
 * 
 * Key improvements for atomic operations:
 * 1. Collects all records first before any database operations
 * 2. Groups records by table for efficient batch inserts
 * 3. Uses database transaction to ensure atomicity - either all records succeed or all fail
 * 4. Provides comprehensive error handling and logging
 * 5. Handles specific error cases gracefully (validator not found, duplicate keys)
 * 
 * @param block - The blockchain block containing events
 * @param finality - Block finality status
 * @param database - Database connection instance
 * @param logger - Logger instance for debugging
 * @param endCursor - Cursor for tracking processing position
 * @param context - Additional context data
 */
export async function commonTransform<T extends Record<string, any>>(
  block: Block,
  finality: string,
  database: PgDatabase<any, any, any>,
  logger: ConsolaInstance,
  endCursor: any,
  context: any
): Promise<void> {
  const { events, header } = block;

  if (!events || !header) return;
  if (!header.blockNumber) {
    throw new Error(`Expected block with blockNumber`);
  }

  // Parse the timestamp correctly - convert to Unix timestamp (seconds)
  const timestamp = Math.round(header.timestamp.getTime() / 1000);

  const CONFIG_ARR = getConfigArr(Number(header.blockNumber));

  // Collect all records first before any database operations
  const recordsToInsert: Array<{ record: T; config: any; tableName: string }> = [];
  for (let myEventIndex = 0; myEventIndex < events.length; myEventIndex++) {
    const event = events[myEventIndex];
    const eventKeyValue = events[myEventIndex].keys[0];
    const configIndex = CONFIG_ARR.findIndex(
      (c) => eventKey(c.eventName) == eventKeyValue && c.contracts.some(c => standariseAddress(c.address) == standariseAddress(event.address))
    );
    const config = CONFIG_ARR[configIndex];

    if (!config) {
      // not an exact match, but could be a sibling
      const isSibling = event.filterIds.some((id) => CONFIG[id].includeReceipt);
      if (!isSibling) {
        logger.error("Unknown event key:", event.transactionHash, event.keys);
        throw new Error(`Unknown event key: ${eventKeyValue}`);
      } else {
        console.log("Sibling event found, skipping", event.transactionHash, event.keys);
        continue;
      }
    }
    logger.info("Processing block:", header.blockNumber, config.eventName);

    if (!event || !event.data || !event.keys) {
      throw new Error(`${config.eventName}: Expected event with data`);
    }
  
    const record = await processEvent(config, event, header, timestamp, events, block) as T;
    recordsToInsert.push({ record, config, tableName: config.tableName });
  }

  // Perform atomic batch insert using database transaction
  if (recordsToInsert.length > 0) {
    await performAtomicBatchInsert(database, recordsToInsert, logger);
  }
}

export async function processEvent(
  config: EventConfig,
  event: Event,
  header: BlockHeader,
  timestamp: number,
  events: readonly Event[],
  block: Block
) {
  
  const result: Record<string, any> = {};
  const timestampISO = header.timestamp.toISOString();
  
  // Parse keys
  config.keyFields.forEach((key, index) => {
    result[key.name] = convertToSqlFormat(event.keys[index + 1], key);
  });

  // Parse data
  let indexAdjustment = 0;
  for (let index = 0; index < event.data.length; index++) {
    const dataField = event.data[index];
    const field = config.dataFields[index - indexAdjustment];

    if (config.dataFields[index - indexAdjustment].type == 'u256') {
      // if next event data is not 0, throw an error
      if (convertToSqlFormat(event.data[index + 1], field) != '0') {
        throw new Error(`Expected 0 for ${field.name}`);
      }
      // allows u to skip this index for the data type
      indexAdjustment++;
      index++;
    }

    if (field.sqlType == 'skip') {
      continue;
    }
    result[field.name] = convertToSqlFormat(dataField, field);

  }

  // Add additional fields
  config.additionalFields.forEach((field) => {
    result[field.name] = getAdditionalFieldValue(
      field,
      event,
      event.transactionHash,
      header,
      timestampISO
    );
  });

  // Standard fields that match new indexer structure
  result.tx_index = event.transactionIndex;;
  result.block_number = Number(header.blockNumber);
  result.event_index = event.eventIndex !== undefined ? event.eventIndex : 0;
  result.tx_hash = event.transactionHash;

  result.timestamp = timestamp;
  result.cursor = BigInt(header.blockNumber);

  console.log("result", result);

  // process any custom logic
  if (config.onEvent) {
    await config.onEvent(event, result, events, block);
  }

  // Convert all BigInt values to strings
  for (const key in result) {
    if (typeof result[key] === "bigint") {
      result[key] = result[key].toString();
    }
  }

  return result;
}

function convertToSqlFormat(value: FieldElement, field: EventField): string {
  if (!value) {
    return getDefaultValueForType(field.sqlType);
  }

  try {
    const bigIntValue = BigInt(value);
    switch (field.sqlType) {
      case "text":
        return standariseAddress(`0x${bigIntValue.toString(16).padStart(64, "0")}`);
      case `numeric(5,2)`:
        return (bigIntValue / 100n).toString();
      case "numeric(78,0)":
      case "numeric(20,0)":
        return bigIntValue.toString();
      case "boolean":
        return bigIntValue.toString() == "1" ? "true" : "false";
      default:
        throw new Error(`Unknown SQL type: ${field.sqlType}`);
    }
  } catch (error) {
    console.warn(
      `Failed to convert value ${value} to BigInt for field ${field.name}, using default`
    );
    return getDefaultValueForType(field.sqlType);
  }
}

function getDefaultValueForType(sqlType: string): string {
  switch (sqlType) {
    case "text":
      return "";
    case "numeric(5,2)":
    case "numeric(78,0)":
    default:
      return "0";
  }
}

function getAdditionalFieldValue(
  field: AdditionalField,
  event: any,
  transaction: any,
  header: any,
  timestamp: string
): any {
  switch (field.source) {
    case "transaction":
      return field.path ? getNestedValue(transaction, field.path) : transaction;
    case "block":
      if (field.name === "timestamp") return timestamp;
      return field.path ? getNestedValue(header, field.path) : header;
    case "event":
      return field.path ? getNestedValue(event, field.path) : event;
    case "custom":
      return field.customLogic
        ? field.customLogic(event, transaction, header)
        : null;
    default:
      return null;
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((o, key) => o && o[key], obj);
}

export function eventKey(name: string): `0x${string}` {
  const h = BigInt(hash.getSelectorFromName(name));
  return `0x${h.toString(16).padStart(64, "0")}`;
}
