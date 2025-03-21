import { standariseAddress, toBigInt, toHex, toNumber } from "./../utils.ts";
import { TOKENS, isTLS } from "./constants.ts";

// Initiate a filter builder
const claimedKey = "0x2adf9f56e1f4e16a3e116f34424bd26cb5fc45363498015b4c007835318f7bb"
const KEYS = [claimedKey]

const filter: any = {
    events: [],
    header: {weak: false}
}

KEYS.forEach(k => {
    filter.events.push({
        keys: [k, "0x00"],
        includeReceipt: false,
        includeReverted: false,
    })
})

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: 1181142, // deployment block of first contract
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: filter,
    sinkType: "postgres",
    sinkOptions: {
        noTls: isTLS, // true for private urls, false for public urls
        tableName: "pixels"
    },
};

// Event processor function to store in db
export default function transform({ header, events }: any) {
    if (!header || !events) return [];

    const { blockNumber, timestamp } = header;

    // if (blockNumber > 745800) {
    //     console.log('Skipping block', blockNumber);
    //     return [];
    // }
    
    return events.map(({ event, transaction, receipt }: any) => {
        if (!transaction || !transaction.meta) return null;
        if (!event || !event.data || !event.keys) return null;
        const key = standariseAddress(event.keys[0]);
        if (!KEYS.includes(key)) {
            return null;
        }
        const transactionHash = transaction.meta.hash;

        if (!event || !event.data || !event.keys) {
            console.error('strkfarm:harvests:Expected event with data');
            throw new Error('strkfarm:harvests:Expected event with data');
        }

    //    console.log(event.keys, 'keys')
    //    console.log(event.data, 'data')
        const action: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),

            canvas_id: toNumber(event.keys[1]),
            placed_by: standariseAddress(event.keys[2]),
            position: toNumber(event.keys[3]),
            color: toNumber(event.data[0]),
            timestamp: Math.round((new Date(timestamp)).getTime() / 1000),
        };
        console.log(action)
        return action;
    }).filter(e => e != null)
}