import type { Block } from "@apibara/starknet";
import { getSelector } from "@apibara/starknet";
import type { ConsolaInstance } from "@apibara/indexer/plugins";
import { PgDatabase } from "drizzle-orm/pg-core";
import { RpcProvider } from "starknet";

import { standariseAddress } from "../../src/utils";
import * as schema from "../drizzle/schema";
import { MANAGER_CONTRACT_ADDRESSES } from "./configs/active_permissions";

const SET_MANAGE_ROOT_SELECTOR = standariseAddress(
  getSelector("set_manage_root")
);

export interface DecodedSetManageRootCall {
  managerAddress: string;
  strategistAddress: string;
  merkleRoot: string;
  transactionIndex: number;
  transactionHash: string;
  transactionType: string;
}

interface ParsedCall {
  to: string;
  selector: string;
  calldata: string[];
}

function toHexFelt(felt: string | undefined): string {
  if (!felt) return "0x0";
  return standariseAddress(felt);
}

function readFeltAsNumber(felt: string): number | null {
  const value = Number(BigInt(felt));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function tryParseCompactExecuteCalldata(
  calldata: string[]
): ParsedCall[] | null {
  if (!calldata.length) return null;

  const callCount = readFeltAsNumber(calldata[0]);
  if (!callCount || callCount <= 0) return null;

  let cursor = 1;
  const calls: ParsedCall[] = [];

  for (let i = 0; i < callCount; i++) {
    if (cursor + 2 >= calldata.length) return null;

    const to = toHexFelt(calldata[cursor++]);
    const selector = toHexFelt(calldata[cursor++]);
    const calldataLen = readFeltAsNumber(calldata[cursor++]);
    if (calldataLen === null || cursor + calldataLen > calldata.length) return null;

    const callCalldata = calldata
      .slice(cursor, cursor + calldataLen)
      .map(toHexFelt);
    cursor += calldataLen;

    calls.push({ to, selector, calldata: callCalldata });
  }

  if (cursor !== calldata.length) return null;
  return calls;
}

function tryParseLegacyExecuteCalldata(
  calldata: string[]
): ParsedCall[] | null {
  if (!calldata.length) return null;

  const callCount = readFeltAsNumber(calldata[0]);
  if (!callCount || callCount <= 0) return null;

  const packedStart = 1 + callCount * 4;
  if (packedStart > calldata.length) return null;

  const calls: ParsedCall[] = [];

  for (let i = 0; i < callCount; i++) {
    const base = 1 + i * 4;
    if (base + 3 >= packedStart) return null;

    const to = toHexFelt(calldata[base]);
    const selector = toHexFelt(calldata[base + 1]);
    const offset = readFeltAsNumber(calldata[base + 2]);
    const calldataLen = readFeltAsNumber(calldata[base + 3]);
    if (offset === null || calldataLen === null) return null;

    const start = packedStart + offset;
    if (start + calldataLen > calldata.length) return null;

    const callCalldata = calldata
      .slice(start, start + calldataLen)
      .map(toHexFelt);
    calls.push({ to, selector, calldata: callCalldata });
  }

  return calls;
}

export function parseAccountExecuteCalldata(calldata: string[]): ParsedCall[] {
  return (
    tryParseCompactExecuteCalldata(calldata) ??
    tryParseLegacyExecuteCalldata(calldata) ??
    []
  );
}

function decodeSetManageRootFromParsedCalls(
  calls: ParsedCall[],
  meta: {
    transactionIndex: number;
    transactionHash: string;
    transactionType: string;
  }
): DecodedSetManageRootCall[] {
  const decoded: DecodedSetManageRootCall[] = [];

  for (const call of calls) {
    if (standariseAddress(call.selector) !== SET_MANAGE_ROOT_SELECTOR) continue;
    if (call.calldata.length < 2) continue;

    decoded.push({
      managerAddress: standariseAddress(call.to),
      strategistAddress: standariseAddress(call.calldata[0]),
      merkleRoot: toHexFelt(call.calldata[1]),
      transactionIndex: meta.transactionIndex,
      transactionHash: meta.transactionHash,
      transactionType: meta.transactionType,
    });
  }

  return decoded;
}

function decodeSetManageRootFromTransaction(
  tx: any,
  transactionIndex: number
): DecodedSetManageRootCall[] {
  const transactionHash = toHexFelt(tx.transaction_hash);
  const transactionType = tx.type;

  // Only process INVOKE_V1 and INVOKE_V3 transactions
  if (transactionType !== "INVOKE" || !tx.calldata) {
    return [];
  }

  const meta = {
    transactionIndex,
    transactionHash,
    transactionType,
  };

  const calldata = tx.calldata.map(toHexFelt);
  const calls = parseAccountExecuteCalldata(calldata);
  return decodeSetManageRootFromParsedCalls(calls, meta);
}

function isManagerContract(address: string): boolean {
  const normalised = standariseAddress(address);
  return MANAGER_CONTRACT_ADDRESSES.some(
    (manager) => standariseAddress(manager) === normalised
  );
}

function logDecodedCall(
  logger: ConsolaInstance,
  blockNumber: number,
  call: DecodedSetManageRootCall
): void {
  logger.info(
    `[manage_root] block=${blockNumber} txIndex=${call.transactionIndex} ` +
      `txHash=${call.transactionHash} txType=${call.transactionType} ` +
      `manager=${call.managerAddress} strategist=${call.strategistAddress} ` +
      `merkleRoot=${call.merkleRoot}`
  );
}

async function upsertManageRootRecords(
  database: PgDatabase<any, any, any>,
  records: Array<{
    manager_address: string;
    strategist_address: string;
    merkle_root: string;
    last_modified_block: number;
    last_modified_timestamp: number;
    tx_hash: string;
    cursor: bigint;
  }>,
  logger: ConsolaInstance
): Promise<void> {
  if (records.length === 0) return;

  await database.transaction(async (tx) => {
    for (const record of records) {
      await tx
        .insert(schema.manage_roots)
        .values(record)
        .onConflictDoUpdate({
          target: [
            schema.manage_roots.manager_address,
            schema.manage_roots.strategist_address,
          ],
          set: {
            merkle_root: record.merkle_root,
            last_modified_block: record.last_modified_block,
            last_modified_timestamp: record.last_modified_timestamp,
            tx_hash: record.tx_hash,
            cursor: record.cursor,
          },
        });
    }
  });

  logger.info(`[manage_root] upserted ${records.length} manage_roots record(s)`);
}

export async function processManageRootStorageDiffs(
  block: Block,
  database: PgDatabase<any, any, any>,
  logger: ConsolaInstance,
  timestamp: number,
  cursor: bigint,
  provider: RpcProvider
): Promise<void> {
  const { storageDiffs, header } = block;
  if (!storageDiffs?.length || !header?.blockNumber) {
    return;
  }

  const blockNumber = Number(header.blockNumber);
  // These checks are just sanitization, not needed tho
  const managerStorageDiffs = storageDiffs.filter((diff) =>
    isManagerContract(diff.contractAddress)
  );

  if (managerStorageDiffs.length === 0) return;

  // Fetch transactions from RPC provider
  logger.info(
    `[manage_root] block=${blockNumber} fetching transactions from RPC...`
  );

  const blockWithTxs = await provider.getBlockWithTxs(blockNumber);
  const transactions = blockWithTxs.transactions;

  if (!transactions?.length) {
    logger.warn(
      `[manage_root] block=${blockNumber} no transactions found in block`
    );
    return;
  }

  logger.info(
    `[manage_root] block=${blockNumber} found ${managerStorageDiffs.length} manager storage diff(s), ` +
      `scanning ${transactions.length} transaction(s)`
  );

  const recordsToUpsert: Array<{
    manager_address: string;
    strategist_address: string;
    merkle_root: string;
    last_modified_block: number;
    last_modified_timestamp: number;
    tx_hash: string;
    cursor: bigint;
  }> = [];

  const seenKeys = new Set<string>();

  for (const storageDiff of managerStorageDiffs) {
    const managerAddress = standariseAddress(storageDiff.contractAddress);
    const changedKeys = (storageDiff.storageEntries ?? []).map((entry) =>
      toHexFelt(entry.key)
    );

    logger.info(
      `[manage_root] storage diff on manager=${managerAddress} ` +
        `changedKeys=${JSON.stringify(changedKeys)}`
    );

    const decodedCalls: DecodedSetManageRootCall[] = [];

    for (let txIndex = 0; txIndex < transactions.length; txIndex++) {
      const tx = transactions[txIndex];
      const calls = decodeSetManageRootFromTransaction(tx, txIndex).filter(
        (call) => standariseAddress(call.managerAddress) === managerAddress
      );
      decodedCalls.push(...calls);
    }

    if (decodedCalls.length === 0) {
      logger.warn(
        `[manage_root] block=${blockNumber} manager=${managerAddress} ` +
          `no decoded set_manage_root call found among ${transactions.length} tx(s)`
      );
      continue;
    }

    for (const call of decodedCalls) {
      logDecodedCall(logger, blockNumber, call);

      const key = `${call.managerAddress}:${call.strategistAddress}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      recordsToUpsert.push({
        manager_address: call.managerAddress,
        strategist_address: call.strategistAddress,
        merkle_root: call.merkleRoot,
        last_modified_block: blockNumber,
        last_modified_timestamp: timestamp,
        tx_hash: call.transactionHash,
        cursor,
      });
    }
  }

  await upsertManageRootRecords(database, recordsToUpsert, logger);
}
