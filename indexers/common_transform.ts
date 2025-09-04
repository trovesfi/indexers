import { Block, FieldElement } from "@apibara/starknet";
import { hash } from "starknet";
import { PgDatabase } from "drizzle-orm/pg-core";
import type { ConsolaInstance } from "@apibara/indexer/plugins";
import * as schema from "./drizzle/schema";
import { and, eq } from "drizzle-orm";

import { AdditionalField, CLAIM_KEY, DEPOSIT_KEY, ERC4626_EVENT, EventConfig, getEventConfig, REDEEM_KEY, WITHDRAW_KEY,  } from "./config";
import { toBigInt, toNumber, standariseAddress } from "../src/utils";

// Processor functions
const PROCESSORS = {
  dnmm: (data: any[]) => {
    const key1 = standariseAddress(data[0]);
    const type = key1 == standariseAddress(WITHDRAW_KEY) ? "withdraw" : "deposit";
    const processedData = data.slice(1);

    if (type == "deposit") {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[1]),
        owner: standariseAddress(processedData[1]),
        amount: toBigInt(processedData[2]).toString(),
        type: "deposit",
      };
    } else {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[1]),
        owner: standariseAddress(processedData[2]),
        amount: toBigInt(processedData[3]).toString(),
        type: "withdraw",
      };
    }
  },

  erc4626: (data: any[]) => {
    const type = standariseAddress(data[0]) == standariseAddress(DEPOSIT_KEY) ? "deposit" : "withdraw";
    const processedData = data.slice(1);
    
    if (type == "deposit") {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[1]),
        owner: standariseAddress(processedData[1]),
        amount: toBigInt(processedData[2]).toString(),
        type: "deposit",
      };
    } else {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[1]),
        owner: standariseAddress(processedData[2]),
        amount: toBigInt(processedData[3]).toString(),
        type: "withdraw",
      };
    }
  },

  starknetVaultKit: (data: any[]) => {
    const key1 = standariseAddress(data[0]);
    let type = "deposit";
    let processedData = data.slice(1);
    
    if (key1 == ERC4626_EVENT) {
      processedData = data.slice(2);
      const key2 = standariseAddress(data[1]);
      if (key2 == DEPOSIT_KEY) {
        type = "deposit";
      } else {
        throw new Error("Unknown action type");
      }
    } else if (key1 == REDEEM_KEY) {
      type = "redeem";
    } else if (key1 == CLAIM_KEY) {
      type = "claim";
    } else {
      throw new Error("Unknown action type");
    }

    if (type == "deposit") {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[1]),
        owner: standariseAddress(processedData[1]),
        amount: toBigInt(processedData[2]).toString(),
        request_id: "0",
        epoch: "0",
        type: "deposit",
      };
    } else if (type == "redeem") {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[1]),
        owner: standariseAddress(processedData[0]),
        amount: toBigInt(processedData[4]).toString(),
        request_id: toBigInt(processedData[6]).toString(),
        epoch: toBigInt(processedData[8]).toString(),
        type: "redeem",
      };
    } else {
      return {
        sender: standariseAddress(processedData[0]),
        receiver: standariseAddress(processedData[0]),
        owner: standariseAddress(processedData[0]),
        amount: toBigInt(processedData[3]).toString(),
        request_id: toBigInt(processedData[5]).toString(),
        epoch: toBigInt(processedData[7]).toString(),
        type: "claim",
      };
    }
  }
};

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

  const timestamp = Math.round(header.timestamp.getTime() / 1000);

  for (let event of events) {
    if (!event || !event.data || !event.keys) continue;

    const eventKeyValue = event.keys[0];
    const config = getEventConfig(eventKeyValue);
    
    if (!config) {
      logger.debug(`Skipping unknown event key: ${eventKeyValue}`);
      continue;
    }

    logger.info("Processing block:", header.blockNumber, config.processor);

    // Process event data using the appropriate processor
    const processor = PROCESSORS[config.processor];
    if (!processor) {
      logger.error(`Unknown processor: ${config.processor}`);
      continue;
    }

    const processedData = processor(event.keys.concat(event.data));

    const result: Record<string, any> = {
      ...processedData,
      transaction_hash: event.transactionHash,
      block_number: Number(header.blockNumber),
      timestamp: new Date(timestamp * 1000),
      contract_address: event.address,
      event_index: event.eventIndex !== undefined ? event.eventIndex : 0,
      transaction_index: event.transactionIndex ?? 0,
    };

    // Add additional fields
    config.additionalFields.forEach((field) => {
      result[field.name] = getAdditionalFieldValue(
        field,
        event,
        event.transactionHash,
        header,
        timestamp
      );
    });

    // Convert all BigInt values to strings
    for (const key in result) {
      if (typeof result[key] === "bigint") {
        result[key] = result[key].toString();
      }
    }

    const record = result as T;
    
    try {
      const existing = await database
        .selectDistinct()
        .from(schema[config.tableName])
        .where(
          and(
            eq(schema[config.tableName].block_number, record.block_number),
            eq(schema[config.tableName].transaction_hash, record.transaction_hash),
            eq(schema[config.tableName].event_index, record.event_index)
          )
        )
        .limit(1);

      if (existing.length) {
        logger.info(`Record already exists, updating...`);
        await database
          .update(schema[config.tableName])
          .set(record)
          .where(
            and(
              eq(schema[config.tableName].block_number, record.block_number),
              eq(schema[config.tableName].transaction_hash, record.transaction_hash),
              eq(schema[config.tableName].event_index, record.event_index)
            )
          )
          .execute();
      } else {
        await database
          .insert(schema[config.tableName])
          .values(record)
          .execute();
      }
    } catch (err) {
      logger.error(`Error processing record:`, err);
      logger.debug(`Record:`, record);
    }
  }
}

function getAdditionalFieldValue(
  field: AdditionalField,
  event: any,
  transaction: any,
  header: any,
  timestamp: number
): any {
  switch (field.source) {
    case "transaction":
      return field.path ? getNestedValue(transaction, field.path) : transaction;
    case "block":
      if (field.name === "timestamp") return new Date(timestamp * 1000);
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