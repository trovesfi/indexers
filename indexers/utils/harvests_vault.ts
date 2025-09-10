import { useDrizzleStorage } from "@apibara/plugin-drizzle";
import { Block, TransactionReceipt, Event } from "@apibara/starknet";
import { EventConfig, OnEvent } from "./config";
import { eventKey, processEvent } from "./common_transform";
import { standariseAddress } from ".";
import { num } from "starknet";
import * as schema from "../drizzle/schema";

// Contract configurations for harvests
const CONTRACTS: any = {
    "dnmm": {
        contracts: [{
            address: standariseAddress('0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b'),
            asset: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" // STRK
        }]
    },
    "erc4626": {
        contracts: [
            {
                address: standariseAddress("0x7fb5bcb8525954a60fde4e8fb8220477696ce7117ef264775a1770e23571929"),
                asset: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" // STRK
            },
            {
                address: standariseAddress("0x5eaf5ee75231cecf79921ff8ded4b5ffe96be718bcb3daf206690ad1a9ad0ca"),
                asset: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7" // ETH
            },
            {
                address: standariseAddress("0xa858c97e9454f407d1bd7c57472fc8d8d8449a777c822b41d18e387816f29c"),
                asset: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8" // USDC
            },
            {
                address: standariseAddress("0x115e94e722cfc4c77a2f15c4aefb0928c1c0029e5a57570df24c650cb7cec2c"),
                asset: "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8" // USDT
            }
        ]
    }
}

function processClaim(key: string, data: any[], fromAddress: string) {
    const claimedKey = "0x35cc0235f835cc84da50813dc84eb10a75e24a21d74d6d86278c0f037cb7429"
    const harvestKeyUsual = "0x7bfb812ef65292405e9c4e05f2befe48dae3e62d7ed27bada75d2384e733d3"
    
    if (key == claimedKey) {
        if (data.length == 2) {
            return {
                claimee: standariseAddress(data[0]),
                amount: BigInt(data[1]).toString(),
            }
        } else if (data.length == 3) {
            return {
                claimee: standariseAddress(data[1]),
                amount: BigInt(data[2]).toString(),
            }
        } else {
            console.warn(`strkfarm:harvests:Unknown data length: ${data.length}`);
            return null;
        }
    } else if (key == harvestKeyUsual) {
        if (data.length == 6) {
            return {
                claimee: standariseAddress(fromAddress),
                amount: BigInt(data[2]).toString(),
            }
        } if (data.length == 9) {
            return {
                claimee: standariseAddress(fromAddress),
                amount: BigInt(data[3]).toString(),
            }
        } else {
            console.warn(`[2]strkfarm:harvests:Unknown data length: ${data.length}`);
            return null;
        }
    }
}

export const onEventHarvestsVault: OnEvent = async (event: Event, processedRecord: Record<string, any>, allEvents: readonly Event[], block: Block): Promise<void> => {
    const { db } = useDrizzleStorage();
    
    // Process the claim information similar to legacy logic
    const key = standariseAddress(event.keys[0]);
    const totalData = event.keys.slice(1).concat(event.data);
    const claimInfo = processClaim(key, totalData, event.address);
    
    if (!claimInfo) {
        return; // Skip if no valid claim info
    }
    
    const contract = claimInfo.claimee;
    
    // Find contract info
    const contractInfo = (Object.keys(CONTRACTS) as ('dnmm' | 'erc4626')[]).map((key) => {
        if (key == 'erc4626') {
            return; // skip this key
        }
        if (CONTRACTS[key].contracts.map((c: any) => c.address).includes(contract)) {
            return CONTRACTS[key];
        }
    }).filter(e => e != null)[0];

    if (!contractInfo && key == "0x35cc0235f835cc84da50813dc84eb10a75e24a21d74d6d86278c0f037cb7429") {
        // ignore unknown contracts for claimed events
        return;
    }

    // For claimed events, we need to read the transfer event from receipt
    if (key == "0x35cc0235f835cc84da50813dc84eb10a75e24a21d74d6d86278c0f037cb7429") {
        // Find the transfer event in the same transaction
        const transferEvent = allEvents.find((e) => 
            e.transactionHash === event.transactionHash && 
            e.eventIndex < event.eventIndex &&
            e.keys[0] === "0x99cd8bde557814842a3121e8ddfd4331b19826ce0696c848855790757dfa22" // Transfer event key
        );
        
        if (transferEvent) {
            claimInfo.amount = BigInt(transferEvent.data[2]).toString();
        }
    }
    
    const record: any = {
        block_number: Number(block.header.blockNumber),
        txIndex: event.transactionIndex,
        eventIndex: event.eventIndex,
        txHash: event.transactionHash,
        user: "", // caller - not applicable for harvests
        contract: claimInfo.claimee,
        amount: claimInfo.amount,
        price: 0,
        timestamp: Math.round(block.header.timestamp.getTime() / 1000),
        cursor: BigInt(block.header.blockNumber).toString(),
    }

    await db.insert(schema.harvests).values([record]).execute();
}
