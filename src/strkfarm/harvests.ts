import { standariseAddress, toBigInt, toHex, toNumber } from "./../utils.ts";
import { TOKENS, isTLS } from "./constants.ts";

function processClaim(data: any[], hash: string) {
    if (data.length == 2) {
        return {
            claimee: standariseAddress(data[0]),
            amount: toBigInt(data[1]).toString(),
        }
    } else if (data.length == 3) {
        return {
            claimee: standariseAddress(data[1]),
            amount: toBigInt(data[2]).toString(),
        }
    } else {
        // will be ignored
        console.warn(`strkfarm:harvests:Unknown data length: ${data.length}`);
        return null;
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
                address: standariseAddress('0x9140757f8fb5748379be582be39d6daf704cc3a0408882c0d57981a885eed9'),
                asset: TOKENS.ETH
            }
        ],
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
    }
}
// Initiate a filter builder
const claimedKey = "0x35cc0235f835cc84da50813dc84eb10a75e24a21d74d6d86278c0f037cb7429"
const KEYS = [claimedKey]

const filter: any = {
    events: [],
    header: {weak: false}
}

KEYS.forEach(k => {
    filter.events.push({
        keys: [k],
        includeReceipt: false,
        includeReverted: false,
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
        tableName: "harvests"
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

        const totalData = event.keys.slice(1).concat(event.data);
        const claimInfo = processClaim(totalData, transactionHash);
        if (!claimInfo) {
            return null;
        }
        const contract = claimInfo.claimee;

        // if below validations pass, this is set to the tx sender address
        let caller = '';

        // confirm the contract is one of my contracts
        const contractInfo = Object.keys(CONTRACTS).map((key: string) => {
            if (CONTRACTS[key].contracts.map((c: any) => c.address).includes(contract)) {
                return CONTRACTS[key];
            }
        }).filter(e => e != null)[0];

        if (!contractInfo) {
            // ignore unknown contracts
            return null;
        } else {
            // if (receipt.executionStatus != 'executionStatus') {
            //     // ideally this tx shouldnt be here, but if it is, we should throw an error
            //     console.error(`strkfarm:harvests:Transaction failed: ${transactionHash}, cannot consider for harvest`);
            //     throw new Error('strkfarm:harvests:Transaction failed');
            // } else {
            //     const events = receipt.events;
            //     const thisEventIndex = events.findIndex((e: any) => standariseAddress(e.fromAddress) == fromAddress);
            //     if (thisEventIndex <= 0) {
            //         // bcz atleast one transfer event is expected before the claim event
            //         console.error(`strkfarm:harvests:Event not found in transaction: ${transactionHash}`);
            //         throw new Error('strkfarm:harvests:Event not found');
            //     }
            //     const transferEvent = events[thisEventIndex - 1];
            //     if (standariseAddress(transferEvent.fromAddress) != standariseAddress(TOKENS.STRK)) {
            //         console.error(`strkfarm:harvests:Transfer event not found in transaction: ${transactionHash}`);
            //         throw new Error('strkfarm:harvests:Transfer event not found');                      
            //     }
            //     const receiver = standariseAddress(transferEvent.data[1]);
            //     const transferAmount = toBigInt(transferEvent.data[2]).toString();
            //     if (receiver != contract) {
            //         console.error(`strkfarm:harvests:Receiver address mismatch: ${receiver} != ${contract}`);
            //         throw new Error('strkfarm:harvests:Receiver address mismatch');
            //     }
            //     if (transferAmount != claimInfo.amount) {
            //         console.error(`strkfarm:harvests:Transfer amount mismatch: ${transferAmount} != ${claimInfo.amount}`);
            //         throw new Error('strkfarm:harvests:Transfer amount mismatch');
            //     }
            //     // all validations passed

            //     caller = transaction.invokeV1?.senderAddress || transaction.invokeV2?.senderAddress || transaction.invokeV3?.senderAddress;
            //     if (!caller) {
            //         console.warn(`strkfarm:harvests:Caller address not found: ${transactionHash}`, transaction);
            //     }
            // }
        }

        const action: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),

            contract: claimInfo.claimee,
            amount: claimInfo.amount,
            user: caller,
            price: 0,
            timestamp: Math.round((new Date(timestamp)).getTime() / 1000),
        };
        console.log(action)
        return action;
    }).filter(e => e != null)
}