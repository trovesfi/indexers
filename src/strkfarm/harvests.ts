import { hash } from "https://esm.run/starknet@5.29.0";
import { standariseAddress, toBigInt, toHex, toNumber } from "./../utils.ts";
import { TOKENS, isTLS } from "./constants.ts";

function processClaim(key: string, data: any[], fromAddress: string) {
    if (key == claimedKey) {
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
    } else if (key == harvestKeyUsual) {
        if (data.length == 6) {
            return {
                claimee: standariseAddress(fromAddress),
                amount: toBigInt(data[2]).toString(),
            }
        } if (data.length == 9) {
            return {
                claimee: standariseAddress(fromAddress),
                amount: toBigInt(data[3]).toString(),
            }
        } else {
            // will be ignored
            console.warn(`[2]strkfarm:harvests:Unknown data length: ${data.length}`);
            return null;
        }
    }
}

const VesuRebalanceStrategies = [{
    address: '0x7fb5bcb8525954a60fde4e8fb8220477696ce7117ef264775a1770e23571929',
    name: "Vesu Fusion STRK",
    asset: TOKENS.STRK,
}, {
    name: "Vesu Fusion ETH",
    address: '0x5eaf5ee75231cecf79921ff8ded4b5ffe96be718bcb3daf206690ad1a9ad0ca',
    asset: TOKENS.ETH,
}, {
    name: 'Vesu Fusion USDC',
    address: '0xa858c97e9454f407d1bd7c57472fc8d8d8449a777c822b41d18e387816f29c',
    asset: TOKENS.USDC,
}, {
    name: 'Vesu Fusion USDT',
    address: '0x115e94e722cfc4c77a2f15c4aefb0928c1c0029e5a57570df24c650cb7cec2c',
    asset: TOKENS.USDT,
}]

const EkuboVaults = [{
    address: '0x1f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324',
    name: "Ekubo xSTRK/STRK",
    asset: TOKENS.STRK,
}]

const CONTRACTS = {
    "dnmm": {
        contracts: [{
                address: standariseAddress('0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b'),
                asset: TOKENS.STRK
            }
        ],
    },
    "erc4626":  {
        contracts: [
            ...VesuRebalanceStrategies.map((s) => ({
                address: standariseAddress(s.address),
                asset: s.asset,
            })),
            ...EkuboVaults.map((s) => ({
                address: standariseAddress(s.address),
                asset: s.asset,
            }))
        ],
    }
}
// Initiate a filter builder
const claimedKey = "0x35cc0235f835cc84da50813dc84eb10a75e24a21d74d6d86278c0f037cb7429"
const harvestKeyUsual = "0x7bfb812ef65292405e9c4e05f2befe48dae3e62d7ed27bada75d2384e733d3"; // hash.getSelectorFromName("Harvest");
const LEGACY_KEYS = [claimedKey]
const KEYS = [claimedKey, harvestKeyUsual]

const filter: any = {
    events: [],
    header: {weak: false}
}

LEGACY_KEYS.forEach(k => {
    filter.events.push({
        keys: [k],
        includeReceipt: true,
        includeReverted: false,
        fromAddress: "0x0387f3eb1d98632fbe3440a9f1385Aec9d87b6172491d3Dd81f1c35A7c61048F", // vesu harvest
    })
})

CONTRACTS.erc4626.contracts.forEach((c) => {
    filter.events.push({
        fromAddress: c.address,
        keys: [harvestKeyUsual],
        includeReceipt: false,
        includeReverted: false,
    })
})

export const config = {
    streamUrl: "https://endur-mainnet.starknet.a5a.ch",
    startingBlock: 1078316, // deployment block of first contract
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
        const claimInfo = processClaim(key, totalData, event.fromAddress);
        if (!claimInfo) {
            return null;
        }
        const contract = claimInfo.claimee;

        // if below validations pass, this is set to the tx sender address
        let caller = '';

        // confirm the contract is one of my contracts
        const contractInfo = (Object.keys(CONTRACTS) as ('dnmm' | 'erc4626')[]).map((key) => {
            if (key == 'erc4626') {
                return; // skip this key
            }
            if (CONTRACTS[key].contracts.map((c: any) => c.address).includes(contract)) {
                return CONTRACTS[key];
            }
        }).filter(e => e != null)[0];

        if (!contractInfo && key == claimedKey) {
            // ignore unknown contracts
            return null;
        }

        if (key == claimedKey) {
            // read the transfer event before the claim event from receipt
            const events = receipt.events;
            const transferEvent = events[Number(event.index) - 1]; // just the previous event
            claimInfo.amount = toBigInt(transferEvent.data[2]).toString();
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
