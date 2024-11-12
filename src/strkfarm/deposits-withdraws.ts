import { standariseAddress, toBigInt, toHex, toNumber } from "./../utils.ts";
import { TOKENS, isTLS } from "./constants.ts";

function dnmmProcessor(data: any[], type: 'deposit' | 'withdraw') {
    console.log(data, type)
    if (type == 'deposit') {
        return {
            sender: standariseAddress(data[0]), 
            receiver: standariseAddress(data[1]),
            owner: standariseAddress(data[1]),
            amount: toBigInt(data[2]).toString(),
            type: 'deposit',
        }
    } else if (type == 'withdraw') {        
        return {
            sender: standariseAddress(data[0]),
            receiver: standariseAddress(data[1]),
            owner: standariseAddress(data[2]),
            amount: toBigInt(data[3]).toString(),
            type: 'withdraw',
        }
    } else {
        console.error(`Unknown type: ${type}`);
        throw new Error('strkfarm:deposit_withdraw:dnmm: unknown action type');
    }
}

function erc4626Processor(data: any[], type: 'deposit' | 'withdraw') {
    console.log(data, type)
    if (type == 'deposit') {
        return {
            sender: standariseAddress(data[0]), 
            receiver: standariseAddress(data[1]),
            owner: standariseAddress(data[1]),
            amount: toBigInt(data[2]).toString(),
            type: 'deposit',
        }
    } else if (type == 'withdraw') {        
        return {
            sender: standariseAddress(data[0]),
            receiver: standariseAddress(data[1]),
            owner: standariseAddress(data[2]),
            amount: toBigInt(data[3]).toString(),
            type: 'withdraw',
        }
    } else {
        console.error(`Unknown type: ${type}`);
        throw new Error('strkfarm:deposit_withdraw:erc4626: unknown action type');
    }
}

const CONTRACTS: any = {
    "dnmm": {
        contracts: [
            {
                address: standariseAddress("0x04937b58e05a3a2477402d1f74e66686f58a61a5070fcc6f694fb9a0b3bae422"),
                asset: TOKENS.USDC
            }, {
                address: standariseAddress("0x020d5fc4c9df4f943ebb36078e703369c04176ed00accf290e8295b659d2cea6"),
                asset: TOKENS.STRK
            }, {
                address: standariseAddress("0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250"),
                asset: TOKENS.ETH
            }, {
                address: standariseAddress("0x9140757f8fb5748379be582be39d6daf704cc3a0408882c0d57981a885eed9"),
                asset: TOKENS.ETH
            }
        ],
        processor: dnmmProcessor
    },
    "erc4626":  {
        contracts: [
            {
                address: standariseAddress("0x016912b22d5696e95ffde888ede4bd69fbbc60c5f873082857a47c543172694f"),
                asset: TOKENS.USDC
            }, {
                address: standariseAddress("0x541681b9ad63dff1b35f79c78d8477f64857de29a27902f7298f7b620838ea"),
                asset: TOKENS.STRK
            }
        ],
        processor: erc4626Processor
    }
}
// Initiate a filter builder
const depositKey = "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2" // "Deposit"
const withdrawKey = "0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367" // "Withdraw"
const KEYS = [depositKey, withdrawKey]

const filter: any = {
    events: [],
    header: {weak: false}
}

Object.keys(CONTRACTS).map((key: string) => {
    const info = CONTRACTS[key];
    info.contracts.forEach((c: any) => {
        KEYS.forEach(k => {
            filter.events.push({
                fromAddress: c.address,
                keys: [k],
                includeReceipt:false,
                includeReverted: false,
            })
        })
    })
})

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: 628762, // deployment block of first contract
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: filter,
    sinkType: "postgres",
    sinkOptions: {
        noTls: isTLS, // true for private urls, false for public urls
        tableName: "investment_flows",
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
    return events.map(({ event, transaction }: any) => {
        if (!transaction || !transaction.meta) return null;
        if (!event || !event.data || !event.keys) return null;
        const key = standariseAddress(event.keys[0]);
        if (!KEYS.includes(key)) {
            return null;
        }
        const transactionHash = transaction.meta.hash;

        if (!event || !event.data || !event.keys) {
            console.error('dstrkfarm:deposit_withdraw:Expected event with data');
            throw new Error('strkfarm:deposit_withdraw:Expected event with data');
        }

        const contract = standariseAddress(event.fromAddress);
        const contractInfo = Object.keys(CONTRACTS).map((key: string) => {
            if (CONTRACTS[key].contracts.map((c: any) => c.address).includes(contract)) {
                return CONTRACTS[key];
            }
        }).filter(e => e != null)[0];
        if (!contractInfo) {
            console.error(`Unknown contract: ${contract}`);
            throw new Error('strkfarm:deposit_withdraw:Unknown contract');
        }

        const type = key == withdrawKey ? 'withdraw' : 'deposit';
        const asset = contractInfo.contracts.filter((c: any) => c.address == contract)[0].asset;
        console.log(`Processing ${type} event for contract ${contract}`);
        const processor = contractInfo.processor;

        console.log('txHash', transactionHash)
        const info = {
            ...processor(event.keys.slice(1).concat(event.data), type),
            asset,
            contract,
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