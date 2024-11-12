import { standariseAddress, toBigInt, toHex, toNumber } from "../utils.ts";

const filter = {
    events: [{
        fromAddress: '0x07f86226cb6540f36c310aaaf6d677a9a6a62b18bb6dfe826bff45e86d9f8531',
        keys: ['0x6409ae197049e2f3746e223d911271ab2ce615eb3043e5529818e52f727000'],
        includeReceipt: false,
        includeReverted: false
    }],
    header: {weak: false}
}

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: 645845, // deployment block of first contract
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: filter,
    sinkType: "postgres",
    sinkOptions: {
        noTls: true,
        tableName: "framethispeter",
    },
};

// Event processor function to store in db
export default function transform({ header, events }: any) {
    if (!header || !events) return [];

    const { blockNumber, timestamp } = header;
    return events.map(({ event, transaction }: any) => {
        if (!transaction || !transaction.meta) return null;
        if (!event || !event.data || !event.keys) return null;
        const key = standariseAddress(event.keys[0]);
        if (!filter.events[0].keys.includes(key)) {
            return null;
        }
        const transactionHash = transaction.meta.hash;

        if (!event || !event.data || !event.keys) {
            console.error('peter:Expected event with data');
            throw new Error('peter:Expected event with data');
        }

        const info = {
            token_id: toNumber(toBigInt(event.keys[1])),
            receiver: standariseAddress(event.keys[2]),
            tweet_id: toNumber(toBigInt(event.data[0])),
        }
        console.log(info)
        const action: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),

            ...info,
            timestamp: Math.round((new Date(timestamp)).getTime() / 1000),
        };
        console.log(action)
        return action;
    }).filter(e => e != null)
}