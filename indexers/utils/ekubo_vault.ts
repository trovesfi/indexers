import { useDrizzleStorage } from "@apibara/plugin-drizzle";
import { Block, TransactionReceipt, Event } from "@apibara/starknet";
import { EventConfig, OnEvent } from "./config";
import { eventKey, processEvent } from "./common_transform";
import { standariseAddress } from ".";
import { num } from "starknet";
import * as schema from "../drizzle/schema";

export const onEventEkuboVault: OnEvent = async (event: Event, processedRecord: Record<string, any>, allEvents: readonly Event[], block: Block): Promise<void> => {
    const { db } = useDrizzleStorage();
    if (!allEvents.length) {
        throw new Error("Expected allEvents for ekubo_vault");
    }

    // Select events before the current event
    // and sort them by eventIndexInTransaction in descending order
    const filteredEvents = allEvents
        .filter((e) => e.eventIndexInTransaction < event.eventIndexInTransaction)
        .sort((a, b) => b.eventIndexInTransaction - a.eventIndexInTransaction);

    // First PositionUpdated event
    const positionUpdateEvent = filteredEvents.find((e) => standariseAddress(e.keys[0]) == standariseAddress(num.getDecimalString(eventKey("PositionUpdated"))));
    if (!positionUpdateEvent) {
        throw new Error("Expected PositionUpdated event");
    }

    // const positionUpdateEventData = await processEvent(
    //     EKUBO_VAULT_CONFIG[0]!, 
    //     positionUpdateEvent, 
    //     block.header, 
    //     Math.round(block.header.timestamp.getTime() / 1000), 
    //     [], block
    // );
    // const positionUpdateEventKeys = positionUpdateEvent.keys;

    const record: any = {
        block_number: Number(block.header.blockNumber),
        txIndex: event.transactionIndex,
        eventIndex: event.eventIndex,
        txHash: event.transactionHash,
        locker: standariseAddress(positionUpdateEvent.data[0]),
        token0: standariseAddress(positionUpdateEvent.data[1]),
        token1: standariseAddress(positionUpdateEvent.data[2]),
        fee: positionUpdateEvent.data[3].toString(),
        tick_spacing: positionUpdateEvent.data[4].toString(),
        extension: positionUpdateEvent.data[5].toString(),
        salt: BigInt(positionUpdateEvent.data[6]).toString(),
        lower_bound: (BigInt(positionUpdateEvent.data[7].toString()) * BigInt(BigInt(positionUpdateEvent.data[8]).toString() == '1' ? -1 : 1)).toString(),
        upper_bound: (BigInt(positionUpdateEvent.data[9].toString()) * BigInt(BigInt(positionUpdateEvent.data[10]).toString() == '1' ? -1 : 1)).toString(),
        liquidity_delta: (BigInt(positionUpdateEvent.data[11].toString()) * BigInt(BigInt(positionUpdateEvent.data[12]).toString() == '1' ? -1 : 1)).toString(),
        amount0: (BigInt(positionUpdateEvent.data[13].toString()) * BigInt(BigInt(positionUpdateEvent.data[14]).toString() == '1' ? -1 : 1)).toString(),
        amount1: (BigInt(positionUpdateEvent.data[15].toString()) * BigInt(BigInt(positionUpdateEvent.data[16]).toString() == '1' ? -1 : 1)).toString(),
        timestamp: Math.round(block.header.timestamp.getTime() / 1000),
        cursor: BigInt(block.header.blockNumber).toString(),

        vault_address: processedRecord.contract,
        user_address: processedRecord.receiver,
    }

    await db.insert(schema.position_updated).values([record]).execute();
}

const EKUBO_VAULT_CONFIG: EventConfig[] = [
    {
        tableName: "position_updated",
        eventName: "PositionUpdated",
        contracts: [
        {
            address: standariseAddress(
            "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b"
            ),
            asset: "",
        },
        ],
        defaultKeys: [[eventKey('PositionUpdated')]],
        keyFields: [{ name: "event_type", type: "felt252", sqlType: "text" }],
        dataFields: [
            { name: "locker", type: "ContractAddress", sqlType: "text" },
            { name: "pool_key", type: "PoolKey", sqlType: "text" },
            { name: "params", type: "UpdatePositionParameters", sqlType: "text" },
            { name: "delta", type: "Delta", sqlType: "text" },
        ],
        additionalFields: [],
    },
]