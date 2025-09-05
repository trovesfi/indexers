import { Block, FieldElement } from "@apibara/starknet";
import { hash } from "starknet";
import { PgDatabase } from "drizzle-orm/pg-core";
import type { ConsolaInstance } from "@apibara/indexer/plugins";
import { and, eq } from "drizzle-orm";

import * as schema from "../drizzle/schema";

import {
  AdditionalField,
  ContractConfig,
  EventConfig,
  EventField,
  CONFIG,
  withdrawKey,
} from "./config";
import {
  standariseAddress,
  toBigInt,
  toNumber,
  isSaltForContract,
} from "./index";

const CONFIG_ARR = Object.keys(CONFIG).map((key) => CONFIG[key]);

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

  const blockNumber = header.blockNumber;

  logger.info("Processing block:", block.header.blockNumber);

  for (let event of block.events) {
    if (!event || !event.data || !event.keys) return;

    const eventKeyValue = event.keys[0];
    const contract = standariseAddress(event.address);

    let matchedConfig: EventConfig | null = null;
    let contractInfo: ContractConfig | null = null;

    for (const configKey of Object.keys(CONFIG)) {
      const config = CONFIG[configKey];

      // check if contract matches
      const contractMatch = config.contracts.find(
        (c: any) => standariseAddress(c.address) === contract
      );

      if (contractMatch) {
        // check if event key matches
        if (config.keys) {
          const keyMatch = config.keys.some((keySet) =>
            keySet.some(
              (key) =>
                standariseAddress(key) === standariseAddress(eventKeyValue)
            )
          );
          if (keyMatch) {
            matchedConfig = config;
            contractInfo = contractMatch;
            break;
          }
        } else if (config.defaultKeys) {
          // default keys (deposit/withdraw)
          const keyMatch = config.defaultKeys.some(
            (key) => standariseAddress(key) === standariseAddress(eventKeyValue)
          );
          if (keyMatch) {
            matchedConfig = config;
            contractInfo = contractMatch;
            break;
          }
        }
      }
    }

    if (!matchedConfig || !contractInfo) {
      continue; // skip unknown events
    }

    logger.info(
      "Processing event:",
      matchedConfig.eventName,
      matchedConfig.processor
    );

    const transactionHash = event.transactionHash;

    if (!event || !event.data || !event.keys) {
      console.error("Expected event with data");
      throw new Error("strkfarm:deposit_withdraw:Expected event with data");
    }

    let processedInfo;

    try {
      if (matchedConfig.processor === "dnmm") {
        processedInfo = processDnmm(event.keys.concat(event.data));
      } else if (matchedConfig.processor === "erc4626") {
        processedInfo = processErc4626(event.keys.concat(event.data));
      } else if (matchedConfig.processor === "starknetVaultKit") {
        processedInfo = processStarknetVaultKit(event.keys.concat(event.data));
      } else if (matchedConfig.processor === "processPositionFeesCollected") {
        const data = event.keys.concat(event.data);

        if (
          !isSaltForContract(
            standariseAddress(data[7]),
            toBigInt(data[6]).toString()
          )
        ) {
          console.log(
            `Not our salt and owner: ${toBigInt(data[6]).toString()}, skipping ${matchedConfig.eventName} event...`
          );
          continue;
        }
        processedInfo = processPositionFeesCollected(data);
      } else if (matchedConfig.processor === "processPositionUpdated") {
        const data = event.keys.concat(event.data);

        if (toBigInt(data[7]).toString() !== "1269084") {
          console.log(
            `Not our salt: ${toBigInt(data[5]).toString()}, skipping ${matchedConfig.eventName} event...`
          );
          continue;
        }
        processedInfo = processPositionUpdated(data);
      } else {
        processedInfo = processGeneric(event, matchedConfig, contractInfo);
      }
    } catch (error) {
      console.error(
        `Error processing event with ${matchedConfig.processor}:`,
        error
      );
      continue;
    }

    const record: any = {
      block_number: toNumber(toBigInt(blockNumber)),
      txHash: standariseAddress(transactionHash),
      txIndex: toNumber(event.transactionIndex),
      eventIndex: toNumber(event.eventIndex),
      epoch: toNumber(processedInfo.epoch || 0),
      request_id: toNumber(processedInfo.request_id || 0),
      ...processedInfo,
      asset: contractInfo.asset,
      contract,
      timestamp: Math.round(new Date(header.timestamp).getTime() / 1000),
    };

    try {
      let tableSchema;
      let tableName;

      if (matchedConfig.tableName === "position_fees_collected") {
        tableSchema = schema["position_fees_collected"];
        tableName = "position_fees_collected";
      } else if (matchedConfig.tableName === "position_updated") {
        tableSchema = schema["position_updated"];
        tableName = "position_updated";
      } else {
        tableSchema = schema["investment_flows"];
        tableName = "investment_flows";
      }

      const existing = await database
        .selectDistinct()
        .from(tableSchema)
        .where(
          and(
            eq(tableSchema.block_number, record.block_number),
            eq(tableSchema.txHash, record.txHash),
            eq(tableSchema.eventIndex, record.eventIndex)
          )
        )
        .limit(1);

      if (existing.length) {
        console.log(`Record already exists, updating...`);
        await database
          .update(tableSchema)
          .set(record)
          .where(
            and(
              eq(tableSchema.block_number, record.block_number),
              eq(tableSchema.txHash, record.txHash),
              eq(tableSchema.eventIndex, record.eventIndex)
            )
          )
          .execute();
        console.log(`Updated existing record`);
      } else {
        await database.insert(tableSchema).values(record).execute();
      }
    } catch (err) {
      console.log(`record`, record);
      console.log(`Error:`, err);
    }
  }
}

function processDnmm(_data: any[]) {
  const key1 = standariseAddress(_data[0]);
  const type = key1 == standariseAddress(withdrawKey) ? "withdraw" : "deposit";
  const data = _data.slice(1);

  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      amount: toBigInt(data[2]).toString(),
      type: "deposit",
    };
  } else if (type == "withdraw") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[2]),
      amount: toBigInt(data[3]).toString(),
      type: "withdraw",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error("strkfarm:deposit_withdraw:dnmm: unknown action type");
  }
}

function processErc4626(_data: any[]) {
  const depositKey = eventKey("Deposit");
  const withdrawKey = eventKey("Withdraw");
  const type =
    standariseAddress(_data[0]) == standariseAddress(depositKey)
      ? "deposit"
      : "withdraw";
  const data = _data.slice(1);

  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      amount: toBigInt(data[2]).toString(),
      type: "deposit",
    };
  } else if (type == "withdraw") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[2]),
      amount: toBigInt(data[3]).toString(),
      type: "withdraw",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error("strkfarm:deposit_withdraw:erc4626: unknown action type");
  }
}

function processStarknetVaultKit(_data: any[]) {
  const depositKey = eventKey("Deposit");
  const withdrawKey = eventKey("Withdraw");
  const redeemKey = eventKey("RedeemRequested");
  const claimKey = standariseAddress(
    "0x0306482a50ea1a82bc2c1d79de5baf013f58ee2260881f6b6c60d31833ef220d"
  );
  const erc4626Event = eventKey("ERC4626Event");

  const key1 = standariseAddress(_data[0]);
  let type = "deposit";
  let data = _data.slice(1);

  if (key1 == erc4626Event) {
    data = _data.slice(2); // first 2 keys are removed
    const key2 = standariseAddress(_data[1]);
    if (key2 == depositKey) {
      type = "deposit";
    } else {
      throw new Error(
        "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
      );
    }
  } else if (key1 == redeemKey) {
    type = "redeem";
  } else if (key1 == claimKey) {
    type = "claim";
  } else {
    throw new Error(
      "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
    );
  }

  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      amount: toBigInt(data[2]).toString(),
      request_id: "0",
      epoch: 0,
      type: "deposit",
    };
  } else if (type == "redeem") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[0]),
      amount: toBigInt(data[4]).toString(),
      request_id: toBigInt(data[6]).toString(),
      epoch: toBigInt(data[8]).toString(),
      type: "redeem",
    };
  } else if (type == "claim") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[0]),
      owner: standariseAddress(data[0]),
      amount: toBigInt(data[3]).toString(),
      request_id: toBigInt(data[5]).toString(),
      epoch: toBigInt(data[7]).toString(),
      type: "claim",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error(
      "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
    );
  }
}

function processPositionFeesCollected(data: any[]) {
  const lowerBoundVal = data[8];
  const lowerBoundValSign = standariseAddress(data[9]);
  const upperBoundVal = data[10];
  const upperBoundValSign = standariseAddress(data[11]);

  const lower_bound =
    lowerBoundValSign == "0x0"
      ? toBigInt(lowerBoundVal).toString()
      : -toBigInt(lowerBoundVal).toString();
  const upper_bound =
    upperBoundValSign == "0x0"
      ? toBigInt(upperBoundVal).toString()
      : -toBigInt(upperBoundVal).toString();

  const amount0Val = data[12];
  const amount0ValSign = standariseAddress(data[13]);
  const amount1Val = data[14];
  const amount1ValSign = standariseAddress(data[15]);

  const amount0 =
    amount0ValSign == "0x0"
      ? toBigInt(amount0Val).toString
      : -toBigInt(amount0Val).toString();
  const amount1 =
    amount1ValSign == "0x0"
      ? toBigInt(amount1Val).toString
      : -toBigInt(amount1Val).toString();

  return {
    token0: standariseAddress(data[1]),
    token1: standariseAddress(data[2]),
    fee: toBigInt(data[3]).toString(),
    tick_spacing: toBigInt(data[4]).toString(),
    extension: standariseAddress(data[5]),
    salt: toBigInt(data[6]).toString(),
    owner: standariseAddress(data[7]),
    lower_bound,
    upper_bound,
    amount0,
    amount1,
  };
}

function processPositionUpdated(data: any[]) {
  const lowerBoundVal = data[8];
  const lowerBoundValSign = standariseAddress(data[9]);
  const upperBoundVal = data[10];
  const upperBoundValSign = standariseAddress(data[11]);

  const lower_bound =
    lowerBoundValSign == "0x0"
      ? toBigInt(lowerBoundVal).toString()
      : -toBigInt(lowerBoundVal).toString();
  const upper_bound =
    upperBoundValSign == "0x0"
      ? toBigInt(upperBoundVal).toString()
      : -toBigInt(upperBoundVal).toString();

  const amount0Val = data[14];
  const amount0ValSign = standariseAddress(data[15]);
  const amount1Val = data[16];
  const amount1ValSign = standariseAddress(data[17]);

  const amount0 =
    amount0ValSign == "0x0"
      ? toBigInt(amount0Val).toString()
      : -toBigInt(amount0Val).toString();
  const amount1 =
    amount1ValSign == "0x0"
      ? toBigInt(amount1Val).toString()
      : -toBigInt(amount1Val).toString();

  const liquidityDelta = data[12];
  const liquidityDeltaSign = standariseAddress(data[13]);

  const liquidity_delta =
    liquidityDeltaSign == "0x0"
      ? toBigInt(liquidityDelta).toString()
      : -toBigInt(liquidityDelta).toString();

  return {
    locker: standariseAddress(data[1]),
    token0: standariseAddress(data[2]),
    token1: standariseAddress(data[3]),
    fee: toBigInt(data[4]).toString(),
    tick_spacing: toBigInt(data[5]).toString(),
    extension: standariseAddress(data[6]),
    salt: toBigInt(data[7]).toString(),
    lower_bound,
    upper_bound,
    liquidity_delta,
    amount0,
    amount1,
  };
}

function processGeneric(event: any, config: EventConfig, contractInfo: any) {
  const result: Record<string, any> = {};

  // parse keys (skip first key which is the event identifier)
  config.keyFields.forEach((key, index) => {
    if (index === 0) return;
    result[key.name] = convertToSqlFormat(event.keys[index + 1], key);
  });

  // parse data
  config.dataFields.forEach((field, index) => {
    result[field.name] = convertToSqlFormat(event.data[index], field);
  });

  // add additional fields
  config.additionalFields.forEach((field) => {
    result[field.name] = getAdditionalFieldValue(
      field,
      event,
      event.transactionHash,
      event.header,
      new Date().toISOString()
    );
  });

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
        return standariseAddress(`0x${bigIntValue.toString(16)}`);
      case "numeric(5,2)":
        return (bigIntValue / 100n).toString();
      case "numeric(78,0)":
      case "numeric(20,0)":
      default:
        return bigIntValue.toString();
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
    case "numeric(20,0)":
    default:
      return "0";
  }
}

function getAdditionalFieldValue(
  field: AdditionalField,
  event: any,
  transaction: any,
  header: any,
  timestamp: string,
  config?: EventConfig,
  contractInfo?: any
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
