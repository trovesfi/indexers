import { standariseAddress, toBigInt, toHex, toNumber } from "../../utils.ts";
import { CONTRACTS_INFO, isTLS } from "../constants.ts";

// Initiate a filter builder
const eventKey = "0x3b885cf23c3ed31cf487da51fdceda290643d1d839b632557ea1e2c9d6f348b" // "Rebalance"
const filter: any = {
    events: [{
        fromAddress: CONTRACTS_INFO.loanguard.address,
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
        tableName: "rebalances",
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
            strategy: toHex(event.data[1]),
            token: toHex(event.data[2]),
            amount: toBigInt(event.data[3]).toString(),
            protocol: protocolIndexToName(Number(event.data[5])),
            is_outflow: Number(event.data[6]) == 1,
            previous_health_factor: toNumber(event.data[7]),
            new_health_factor: toNumber(event.data[8]),
        }

        console.log(info)

        const rebalance: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),

            user: info.user,
            strategy: info.strategy,
            token: info.token,
            amount: info.amount,
            protocol: info.protocol,
            is_outflow: info.is_outflow,
            previous_health_factor: info.previous_health_factor,
            new_health_factor: info.new_health_factor,
        };
        console.log(rebalance)
        return rebalance;
    }).filter(e => e != null)
}