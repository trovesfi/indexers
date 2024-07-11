import { standariseAddress, toBigInt, toHex, toNumber } from "../../utils.ts";
import { CONTRACTS_INFO, isTLS } from "../constants.ts";

// Initiate a filter builder
const eventKey = "0x5b8c9e6d9ac1e8989c4b1fc484a8fa1d03f2a35bdf65e3bf6e633d64628a49" // "SubscriptionUpdate"
const filter: any = {
    events: [{
        fromAddress: CONTRACTS_INFO.loanguard.address, // STRK
        keys: [eventKey],
        includeReceipt:false,
        includeReverted: false,
    }],
    header: {weak: false}
}

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: CONTRACTS_INFO.loanguard.start_block, // deployment block of the contract
    network: "starknet",
    finality: "DATA_STATUS_PENDING",
    filter: filter,
    sinkType: "postgres",
    sinkOptions: {
        noTls: isTLS, // true for private urls, false for public urls
        tableName: "subscriptions",
    },
};

function protocolIndexToName(index: number) {
    switch (index) {
        case 0: return "none";
        case 1: return "zkLend";
        case 2: return "Nostra";
        default: throw new Error(`Unknown protocol index ${index}`);
    }
}

// Event processor function to store in db
export default function transform({ header, events }: v1alpha2.Block) {
    if (!header || !events) return [];

    const { blockNumber, timestamp } = header;
    return events.map(({ event, transaction }) => {
        if (!transaction || !transaction.meta) return null;
        if (!event || !event.data || !event.keys) return null;
        const key = standariseAddress(event.keys[0]);
        if (key != eventKey) {
            return null;
        }
        const transactionHash = transaction.meta.hash;

        if (!event || !event.data || !event.keys) 
            throw new Error('zkLend:new_reserve:Expected event with data');

        const info = {
            user: toHex(event.data[0]),
            min_health_factor: toBigInt(event.data[1]).toString(),
            max_health_factor: toBigInt(event.data[2]).toString(),
            target_health_factor: toBigInt(event.data[3]).toString(),
            is_active: Number(event.data[4]) == 1,
            protocol: protocolIndexToName(Number(event.data[5])),
            timestamp: toBigInt(event.data[6]).toString(),
        }

        console.log(info)

        const subscription: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),

            user: info.user,
            min_health_factor: info.min_health_factor,
            max_health_factor: info.max_health_factor.toString(),
            target_health_factor: info.target_health_factor.toString(),
            is_active: info.is_active,
            protocol: info.protocol,
            timestamp: toNumber(info.timestamp),
        };
        console.log(subscription)
        return subscription;
    }).filter(e => e != null)
}