import { useDrizzleStorage } from "@apibara/plugin-drizzle";
import { Block, Event } from "@apibara/starknet";
import { num } from "starknet";

import { OnEvent } from "./config";
import { eventKey } from "./common_transform";
import { standariseAddress } from ".";
import * as schema from "../drizzle/schema";
// import { EkuboCLVaultV2Strategies } from "@strkfarm/sdk";
// sdk is not ready to go live hence to run the indexer this vault has been hardcoded. Remember to remove it once sdk have required changes published.
import { HC_EkuboCLVaultV2Strategies as EkuboCLVaultV2Strategies } from "./constants";

export const onEventEkuboVaultV2: OnEvent = async (
  event: Event,
  processedRecord: Record<string, any>,
  allEvents: readonly Event[],
  block: Block
): Promise<void> => {
  const { db } = useDrizzleStorage();
  if (!allEvents.length) {
    throw new Error("Expected allEvents for ekubo_vault_v2");
  }

  // if event is not from V2 Ekubo pools, return
  if (!EkuboCLVaultV2Strategies.some((strat) => strat.address.eqString(event.address))) {
    return;
  }

  // Select events before the current event
  // and sort them by eventIndexInTransaction in descending order
  const filteredEvents = allEvents
    .filter((e) => e.eventIndexInTransaction < event.eventIndexInTransaction)
    .sort((a, b) => b.eventIndexInTransaction - a.eventIndexInTransaction);

  // First EkuboPositionUpdated event (from vault, not Ekubo core)
  const positionUpdateEvent = filteredEvents.find(
    (e) =>  
      standariseAddress(e.keys[0]) ==
      standariseAddress(num.getDecimalString(eventKey("PositionUpdated")))
  );
  
  if (!positionUpdateEvent) {
    throw new Error("Expected EkuboPositionUpdated event for V2 vault");
  }

  // EkuboPositionUpdated data structure:
  // nft_id (u64 = 1 felt), pool_key (PoolKey), bounds (Bounds), amount0_delta (i129), amount1_delta (i129), liquidity_delta (i129)
  // PoolKey: token0, token1, fee (u128 = 2 felts), tick_spacing (u128 = 2 felts), extension
  // nft_id is data[0]
  // PoolKey starts at data[1]
  const token0 = standariseAddress(`0x${BigInt(positionUpdateEvent.data[1]).toString(16).padStart(64, "0")}`);
  const token1 = standariseAddress(`0x${BigInt(positionUpdateEvent.data[2]).toString(16).padStart(64, "0")}`);

  const record: any = {
    block_number: Number(block.header.blockNumber),
    tx_index: event.transactionIndex,
    event_index: event.eventIndex,
    tx_hash: event.transactionHash,
    sender: processedRecord.sender,
    owner: processedRecord.owner,
    receiver: processedRecord.receiver || processedRecord.owner, // receiver only in withdraw
    shares: processedRecord.shares,
    amount0: processedRecord.amount0,
    amount1: processedRecord.amount1,
    token0,
    token1,
    vault_address: processedRecord.contract,
    user_address: processedRecord.user_address,
    type: processedRecord.type,
    timestamp: Math.round(block.header.timestamp.getTime() / 1000),
    cursor: BigInt(block.header.blockNumber).toString(),
  };

  await db.insert(schema.ekubo_v2_investment_flows).values([record]).execute();
};
