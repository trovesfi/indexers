import { standariseAddress, toBigInt, toHex, toNumber } from "./utils.ts";

// Initiate a filter builder
const filter: any = {
    events: [],
    header: {weak: false}
}

const TOKENS = [
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac"
]
// Add all contracts to monitor for events into the filter
TOKENS.map((t) => {
    filter.events.push({
        fromAddress: t,
        keys: ["0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9"], // Transfer event
        // data: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
        includeReceipt:false,
        includeReverted: false,
    })
})

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: 1190000,
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: filter,
    sinkType: "postgres",
    sinkOptions: {
        noTls: true, // true for private urls, false for public urls
        tableName: "transfers",
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
        if (key != '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9') {
            return null;
        }
        const transactionHash = transaction.meta.hash;

        if (!event || !event.data || !event.keys) 
            throw new Error('SNFCH:Expected event with data');

        const claimInfo = {
            contract: toHex(event.fromAddress),
            from: toHex(event.data[0]),
            receiver: toHex(event.data[1]),
            amount: toBigInt(event.data[2]).toString(),
        }

        const claim: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),

            ...claimInfo,

            timestamp: Math.round(new Date(header.timestamp).getTime() / 1000)
        };
        // console.log(claim, "claim");
        return claim;
    }).filter((e: any) => e != null)
}