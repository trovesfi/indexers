import { PrismaClient, transfers } from "@prisma/client";
import { writeFileSync } from 'fs';
import { num } from "starknet";

const prisma = new PrismaClient();

interface Data {
    amount: bigint,
    transactions: string[]
}

declare namespace BigInt {
    function toJSON(): string;
}

BigInt.prototype.toJSON = function() {
    return this.toString();
}

export function standariseAddress(address: string | bigint) {
    let _a = address;
    if (!address) {
        _a = "0";
    }
    const a = num.getHexString(num.getDecimalString(_a.toString()));
    return a;
}

const IGNORE_OUTBOUND = [
    standariseAddress('0xca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7')
]

async function computeFinalHoldings() {
    const tokenHoldings: Record<string, Record<string, Data>> = {};
    const totalBridhed: Record<string, bigint> = {};

    // Sort transfers sequentially by (block_number, txIndex, eventIndex)
    const SIZE = 500000;
    let COUNT = 0;
    while (true) {
        let _transfers: transfers[] = []
        const t = await prisma.transfers.findMany({
            take: SIZE,
            skip: COUNT * SIZE,
        });
        _transfers = _transfers.concat(t);
        console.log('batch len', t.length);
        console.log('last block', _transfers[_transfers.length - 1].block_number);
        if (t.length != SIZE) {
            break;
        }

        _transfers.sort((a, b) => {
            if (a.block_number !== b.block_number) return a.block_number - b.block_number;
            if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
            return a.eventIndex - b.eventIndex;
        });
        
        let index = 0;
        for (const transfer of _transfers) {
            const { contract, from, receiver, amount } = transfer;
            const amt = BigInt(amount);
        
            if (!tokenHoldings[contract]) {
                tokenHoldings[contract] = {};
            }

            if (!totalBridhed[contract]) {
                totalBridhed[contract] = 0n;
            }
            
            if (from === "0x0") {
                // Initial source of tokens
                if (!tokenHoldings[contract][receiver]) {
                    tokenHoldings[contract][receiver] = { amount: amt, transactions: [transfer.txHash] };
                } else {
                    tokenHoldings[contract][receiver].amount += amt;
                    tokenHoldings[contract][receiver].transactions.push(transfer.txHash);
                }
                totalBridhed[contract] += amt;
            } else if (IGNORE_OUTBOUND.includes(from)) {
                // Ignore outbound transfers from listed contracts
                continue;

            } else {
                const transferable = tokenHoldings[contract][from]?.amount || 0n;
                const transferAmt = amt > transferable ? transferable : amt;
        
                if (transferAmt > 0n) {
                    tokenHoldings[contract][from].amount -= transferAmt;
                    if (!tokenHoldings[contract][receiver]) {
                        tokenHoldings[contract][receiver] = { amount: transferAmt, transactions: [transfer.txHash] };
                    } else {
                        tokenHoldings[contract][receiver].amount += transferAmt;
                        tokenHoldings[contract][receiver].transactions.push(transfer.txHash);
                    }
                }
            }
            index += 1
        }

        COUNT += 1
    }
  
    // Sort addresses by max holdings to min per token and return top 10
    // const topHolders: Record<string, [string, bigint][]> = {};
    // for (const token in tokenHoldings) {
    //   const keys = Object.keys(tokenHoldings[token])
    //     .sort((a: string, b: string) => Number(tokenHoldings[token][b].amount - tokenHoldings[token][a].amount))
    //     .slice(0, 10);
    //     topHolders[token] = keys.map((key: string) => [key, tokenHoldings[token][key].amount]);
    // }
    
    writeFileSync('totalBridged.json', JSON.stringify(totalBridhed), 'utf8');
    return tokenHoldings;
}
  

if (require.main === module) {
    async function run() {
        // let _transfers: transfers[] = []
        // const SIZE = 500000;
        // while (true) {
        //     const t = await prisma.transfers.findMany({
        //         take: SIZE,
        //         skip: _transfers.length,
        //         where: {
        //             block_number: {
        //                 lte: 1233682
        //             }
        //         }
        //     });
        //     _transfers = _transfers.concat(t);
        //     console.log('batch len', t.length);
        //     console.log('last block', _transfers[_transfers.length - 1].block_number);
        //     if (t.length != SIZE) {
        //         break;
        //     }
        // }
        
        // console.log('total transfers', _transfers.length)
        writeFileSync('data.json', JSON.stringify(await computeFinalHoldings()), 'utf8');
    }

    run();
}