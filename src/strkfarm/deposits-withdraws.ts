import { standariseAddress, toBigInt, toHex, toNumber } from "./../utils.ts";
import { TOKENS, isTLS } from "./constants.ts";

const depositKey = "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2" // "Deposit"
const withdrawKey = "0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367" // "Withdraw"
const redeemKey = '0xfc5c8e7953c62fb357aebe6619c766f40a3e56113ec060b82286f715b6a7dc'; // RedeemRequested
const claimKey = standariseAddress('0x0306482a50ea1a82bc2c1d79de5baf013f58ee2260881f6b6c60d31833ef220d') // RedeemClaimed
const erc4626Event = '0x20c620f0d41f84d5dcefe97ae96fb9becabb508b15b411d8f34aded3a984986' // ERC4626Event

function dnmmProcessor(_data: any[]) {
    const key1 = standariseAddress(_data[0]);
    const type = key1 == standariseAddress(withdrawKey) ? 'withdraw' : 'deposit';
    const data = _data.slice(1);
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

const EvergreenVaults = [
  {
    address: '0x7e6498cf6a1bfc7e6fc89f1831865e2dacb9756def4ec4b031a9138788a3b5e',
    name: 'USDC Evergreen',
    asset: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'
  },
  {
    address: '0x5a4c1651b913aa2ea7afd9024911603152a19058624c3e425405370d62bf80c',
    name: 'WBTC Evergreen',
    asset: '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac'
  },
  {
    address: '0x446c22d4d3f5cb52b4950ba832ba1df99464c6673a37c092b1d9622650dbd8',
    name: 'ETH Evergreen',
    asset: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
  },
  {
    address: '0x55d012f57e58c96e0a5c7ebbe55853989d01e6538b15a95e7178aca4af05c21',
    name: 'STRK Evergreen',
    asset: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
  },
  {
    address: '0x1c4933d1880c6778585e597154eaca7b428579d72f3aae425ad2e4d26c6bb3',
    name: 'USDT Evergreen',
    asset: '0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8'
  }
]

function erc4626Processor(_data: any[]) {
    const type = standariseAddress(_data[0]) == standariseAddress(depositKey) ? 'deposit' : 'withdraw';
    const data = _data.slice(1);
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

function starknetVaultKitProcessor(_data: any[]) {
    const key1 = standariseAddress(_data[0]);
    let type = 'deposit';
    let data = _data.slice(1);
    if (key1 == erc4626Event) {
        data = _data.slice(2); // first 2 keys are removed
        const key2 = standariseAddress(_data[1]);
        if (key2 == depositKey) {
            type = 'deposit';
        } else {
            throw new Error('strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type');
        }
    } else if (key1 == redeemKey) {
        type = 'redeem';
    } else if (key1 == claimKey) {
        type = 'claim';
    } else {
        throw new Error('strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type');
    }
    console.log(type);
    if (type == 'deposit') {
        return {
            sender: standariseAddress(data[0]), 
            receiver: standariseAddress(data[1]),
            owner: standariseAddress(data[1]),
            amount: toBigInt(data[2]).toString(),
            request_id: "0", // not applicable for deposits
            epoch: 0, // not applicable for deposits
            type: 'deposit',
        }
    } else if (type == 'redeem') {    
        /// Event emitted when a user requests a redemption
        // #[derive(Drop, starknet::Event)]
        // pub struct RedeemRequested {
        //     pub owner: ContractAddress, // Share owner requesting redemption
        //     pub receiver: ContractAddress, // Address to receive the redemption NFT
        //     pub shares: u256, // Original shares requested for redemption
        //     pub assets: u256, // Assets allocated after fees
        //     pub id: u256, // NFT ID for the redemption request
        //     pub epoch: u256 // Epoch when redemption was requested
        // }    
        return {
            sender: standariseAddress(data[0]),
            receiver: standariseAddress(data[1]),
            owner: standariseAddress(data[0]),
            amount: toBigInt(data[4]).toString(),
            request_id: toBigInt(data[6]).toString(), // not applicable for deposits
            epoch: toBigInt(data[8]).toString(),
            type: 'redeem',
        }
    } else if (type == 'claim') {
        // /// Event emitted when a redemption is claimed
        // #[derive(Drop, starknet::Event)]
        // pub struct RedeemClaimed {
        //     pub receiver: ContractAddress, // Address receiving the assets
        //     pub redeem_request_nominal: u256, // Original shares amount
        //     pub assets: u256, // Actual assets received (may be less due to losses)
        //     pub id: u256, // NFT ID that was burned
        //     pub epoch: u256 // Epoch when redemption was originally requested
        // }
        return {
            sender: standariseAddress(data[0]),
            receiver: standariseAddress(data[0]), // just dummy
            owner: standariseAddress(data[0]), // just dummy
            amount: toBigInt(data[3]).toString(),
            request_id: toBigInt(data[5]).toString(), // not applicable for deposits
            epoch: toBigInt(data[7]).toString(),
            type: 'claim',
        }
    } else {
        console.error(`Unknown type: ${type}`);
        throw new Error('strkfarm:deposit_withdraw:erc4626: unknown action type');
    }
}

const CONTRACTS: any = {
    "dnmm": {
        contracts: [
            // {
            //     address: standariseAddress("0x04937b58e05a3a2477402d1f74e66686f58a61a5070fcc6f694fb9a0b3bae422"),
            //     asset: TOKENS.USDC
            // }, {
            //     address: standariseAddress("0x020d5fc4c9df4f943ebb36078e703369c04176ed00accf290e8295b659d2cea6"),
            //     asset: TOKENS.STRK
            // }, {
            //     address: standariseAddress("0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250"),
            //     asset: TOKENS.ETH
            // }, {
            //     address: standariseAddress("0x9140757f8fb5748379be582be39d6daf704cc3a0408882c0d57981a885eed9"),
            //     asset: TOKENS.ETH
            // }, 
            {
                address: standariseAddress("0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b"),
                asset: TOKENS.STRK
            },
            {
                address: standariseAddress("0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"),
                asset: ''
            },
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
            },
            ...VesuRebalanceStrategies.map((s) => {
                return {
                    address: standariseAddress(s.address),
                    asset: s.asset
                }
            })
        ],
        processor: erc4626Processor
    },
    'starknetVaultKit': {
        contracts: [
            ...EvergreenVaults.map((s) => {
                return {
                    address: standariseAddress(s.address),
                    asset: s.asset
                }
            })
        ],
        keys: [[erc4626Event, depositKey], [redeemKey], [claimKey]],
        processor: starknetVaultKitProcessor
    }
}
// Initiate a filter builder
const DEFAULT_KEYS = [depositKey, withdrawKey];
const ALL_KEYS = [depositKey, withdrawKey, redeemKey, claimKey, erc4626Event];

const filter: any = {
    events: [],
    header: {weak: false}
}

Object.keys(CONTRACTS).map((key: string) => {
    const info = CONTRACTS[key];
    info.contracts.forEach((c: any) => {
        if (info.keys) {
            info.keys.forEach((k: string[]) => {
                filter.events.push({
                    fromAddress: c.address,
                    keys: k, // omits start to keys to check
                    includeReceipt:false,
                    includeReverted: false,
                })
            })
        } else {
            DEFAULT_KEYS.forEach(k => {
                filter.events.push({
                    fromAddress: c.address,
                    keys: [k],
                    includeReceipt:false,
                    includeReverted: false,
                })
            })
        }
    })
})

export const config = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: Number(Deno.env.get("START_BLOCK")),
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
        if (!ALL_KEYS.includes(key)) {
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

        const asset = contractInfo.contracts.filter((c: any) => c.address == contract)[0].asset;
        const processor = contractInfo.processor;

        const info = {
            ...processor(event.keys.concat(event.data)),
            asset,
            contract,
        }

        const action: any = {
            block_number: toNumber(toBigInt(blockNumber)),
            txHash: standariseAddress(transactionHash),
            txIndex: toNumber(transaction.meta?.transactionIndex),
            eventIndex: toNumber(event.index),
            epoch: toNumber(0), // default
            request_id: toNumber(0), // default
            ...info,
            timestamp: Math.round((new Date(timestamp)).getTime() / 1000),
        };
        console.log(action)
        return action;
    }).filter(e => e != null)
}