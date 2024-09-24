import { standariseAddress, toBigInt, toHex, toNumber } from "../../utils.ts";
import { CONTRACTS_INFO, isTLS } from "../constants.ts";

const CONTRACTS = [
    "0x04937b58e05a3a2477402d1f74e66686f58a61a5070fcc6f694fb9a0b3bae422",
    "0x020d5fc4c9df4f943ebb36078e703369c04176ed00accf290e8295b659d2cea6",
    "0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250"
]
// Initiate a filter builder
const depositKey = "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2" // "Deposit"
const withdrawKey = "0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367" // "Withdraw"
const KEYS = [depositKey, withdrawKey]

const filter: any = {
    events: [],
    header: {weak: false}
}

CONTRACTS.forEach(c => {
    KEYS.forEach(k => {
        filter.events.push({
            fromAddress: c,
            keys: [k],
            includeReceipt:false,
            includeReverted: false,
        })
    })
})

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: 651636, // deployment block of first contract
    network: "starknet",
    finality: "DATA_STATUS_PENDING",
    filter: filter,
    sinkType: "postgres",
    sinkOptions: {
        noTls: isTLS, // true for private urls, false for public urls
        tableName: "dnmm_user_actions",
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
        if (!KEYS.includes(key)) {
            return null;
        }
        const transactionHash = transaction.meta.hash;

        if (!event || !event.data || !event.keys) {
            console.error('dnmm:dnmm_user_actions:Expected event with data');
            throw new Error('dnmm:dnmm_user_actions:Expected event with data');
        }

        const index_offset = key == withdrawKey ? 1 : 0;
        const data = [...event.keys.slice(1), ...event.data];
        let type = 'deposit';
        if (key == withdrawKey) {
            type = 'withdraw';
        } else if (key == depositKey) {
            // cool
        } else {
            console.error(`Unknown key: ${key}`);
            throw new Error('dnmm:dnmm_user_actions:Unknown key');
        }
        const info = {
            sender: toHex(data[0]),
            receiver: toHex(data[1]),
            owner: toHex(data[1 + index_offset]),
            assets: toHex(data[2 + index_offset]),
            position_acc1_supply_shares: toBigInt(data[4 + index_offset]).toString(),
            position_acc1_borrow_shares: toBigInt(data[6 + index_offset]).toString(),
            position_acc2_supply_shares: toBigInt(data[8 + index_offset]).toString(),
            position_acc2_borrow_shares: toBigInt(data[10 + index_offset]).toString(),
            contract: standariseAddress(event.fromAddress),
            type
        }

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