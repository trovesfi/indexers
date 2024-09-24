import { PrismaClient } from "@prisma/client";
import { writeFileSync } from 'fs';
import yahooFinance from 'yahoo-finance2';
import { getClosePriceAtTimestamp } from "./graphql/utils";

async function run() {
    const prisma = new PrismaClient();

    const result = await prisma.subscriptions.findMany();
    console.log(result);
}

async function dnmm() {
    const prisma = new PrismaClient();
    
    // get distinct contracts
    const result2 = await prisma.dnmm_user_actions.findMany({
        distinct: ['contract']
    });
    // console.log(result2)

    const result = await prisma.dnmm_user_actions.findMany({
        orderBy: [{
            block_number: 'asc',
        }, {
            txIndex: 'asc',
        }, {
            eventIndex: 'asc',
        }],
        where: {
            contract: '0x20d5fc4c9df4f943ebb36078e703369c04176ed00accf290e8295b659d2cea6',
            block_number: {
                gt: 661768
            }
        }
    });
    // console.log(result);
    console.log(result.length);

    const roundSharesMap: any = {};
    result.forEach((action: any) => {
        const existing = roundSharesMap[action.owner];
        if (existing) {
            existing.points += existing.lpShares * BigInt(action.block_number - existing.block_number);
            existing.lpShares = BigInt(action.position_acc1_supply_shares);
            existing.block_number = action.block_number
            existing.actions.push({
                block: action.block_number,
                amount: (BigInt(action.position_acc1_supply_shares) / BigInt(10 ** 18)).toString(),
                fullAmount: action.position_acc1_supply_shares,
                type: action.type,
                diff: action.block_number - existing.actions[existing.actions.length - 1].block
            })
            roundSharesMap[action.owner] = existing;
        } else {
            roundSharesMap[action.owner] = {
                lpShares: BigInt(action.position_acc1_supply_shares),
                block_number: action.block_number,
                points: BigInt(0),
                firstBlock: action.block_number,
                actions: [{
                    block: action.block_number,
                    amount: (BigInt(action.position_acc1_supply_shares) / BigInt(10 ** 18)).toString(),
                    fullAmount: action.position_acc1_supply_shares,
                    type: action.type,
                    diff: 0
                }]
            }
        }
    })

    // ! Update this
    const CURRENT_BLOCK = 661793;
    Object.keys(roundSharesMap).forEach((key) => {
        const existing = roundSharesMap[key];
        existing.points += existing.lpShares * BigInt(CURRENT_BLOCK - existing.block_number);
        existing.points = existing.points.toString()
        existing.block_number = CURRENT_BLOCK;
        existing.lpShares = existing.lpShares.toString()
        existing.diff = existing.block_number - existing.firstBlock;
        roundSharesMap[key] = existing;
    })
    console.log(roundSharesMap);
    writeFileSync('dnmm.json', JSON.stringify(roundSharesMap))
}

async function depositsAndWithdraws() {
    const prisma = new PrismaClient();

    // total deposits and withdraws
    const result = await prisma.investment_flows.aggregate({
        _count: true,
    });
    console.log("Total deposits and withdraws: ", result._count);

    // just deposits
    const deposits = await prisma.investment_flows.aggregate({
        _count: true,
        where: {
            type: 'deposit'
        }
    });
    console.log("Total deposits: ", deposits._count);

    // just withdraws
    const withdraws = await prisma.investment_flows.aggregate({
        _count: true,
        where: {
            type: 'withdraw'
        }
    });
    console.log("Total withdraws: ", withdraws._count);

    // unique users/owners
    const uniqueOwners = await prisma.investment_flows.findMany({
        distinct: ['owner'],
        select: {
            owner: true
        }
    });
    console.log("Unique owners: ", uniqueOwners.length);
    console.log("=====================================");

    // deposits and withdraws breakdown by contract
    const contracts = await prisma.investment_flows.findMany({
        distinct: ['contract'],
        select: {
            contract: true
        }
    });

    for(let i = 0; i < contracts.length; i++) {
        const contract = contracts[i];
        const contractDeposits = await prisma.investment_flows.aggregate({
            _count: true,
            where: {
                type: 'deposit',
                contract: contract.contract
            }
        });
        const contractWithdraws = await prisma.investment_flows.aggregate({
            _count: true,
            where: {
                type: 'withdraw',
                contract: contract.contract
            }
        });
        console.log(`Contract: ${contract.contract}`);
        console.log(`Deposits: ${contractDeposits._count}`);
        console.log(`Withdraws: ${contractWithdraws._count}`);
        console.log("\n=====================================");
    };
}

type Transaction = {
    rawAmount: number; // Amount in token with sign
    amount: number;   // Positive for deposit, negative for withdraw
    timestamp: number; // Time in seconds
    date: Date
};
  
function hasThousandDollarsFor30Days(transactions: Transaction[]): boolean {
    // Sort transactions by timestamp
    transactions.sort((a, b) => a.timestamp - b.timestamp);
  
    let balance = 0;
    let windowStartIndex = 0;
  
    for (let i = 0; i < transactions.length; i++) {
      const { amount, timestamp } = transactions[i];
      
      // Add the transaction to the balance
      balance += amount;
  
      // Remove the effect of transactions outside the 30-day window
      while (timestamp - transactions[windowStartIndex].timestamp >= 2592000) { // 30 days in seconds
        balance -= transactions[windowStartIndex].amount;
        windowStartIndex++;
      }
  
      // Check if the balance has been above $1000 for the last 30 days
      if (balance >= 950 && (i == transactions.length - 1 || transactions[i + 1].timestamp - transactions[windowStartIndex].timestamp >= 2592000)) {
        return true;
      }
    }
  
    return false;
}

const tokenKeyMap: any = {
    "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": {
        yFinanceKey: 'STRK22691-USD',
        decimals: 18
    },
    "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": {
        yFinanceKey: null,
        decimals: 6
    }
}

const priceHistory: any = {};
async function getPrice(tokenAddress: string, timestamp: number) {
    const key = tokenKeyMap[tokenAddress].yFinanceKey;
    if (!key) {
        return 1;
    }

    const prices = priceHistory[tokenAddress];
    if (!prices) {
        const results = await yahooFinance.chart('STRK22691-USD', {
            period1: '2024-02-01'
        });
        priceHistory[tokenAddress] = results.quotes;
        const priceInfo = getClosePriceAtTimestamp(results.quotes, timestamp);
        return priceInfo;
    } else {
        const priceInfo = getClosePriceAtTimestamp(prices, timestamp);
        return priceInfo;
    }
}

async function getInvestmentFlowsGroupedByUser() {
    const prisma = new PrismaClient();

    const investmentFlows = await prisma.investment_flows.findMany({
        orderBy: {
            timestamp: 'asc'
        }
    });

    const groupedByUser: any = {};
    for (let i = 0; i < investmentFlows.length; i++) {
        const flow = investmentFlows[i];
        const existing = groupedByUser[flow.owner];
        const decimals = tokenKeyMap[flow.asset].decimals;
        const rawAmount = Number(((BigInt(flow.amount) * BigInt(1000))/ BigInt(10 ** decimals)).toString()) / 1000;
        const price: number | null = await getPrice(flow.asset, flow.timestamp);
        if (!price) {
            console.error("Price not found for flow: ", flow);
            return;
        }
        const amountAbs = rawAmount * price;
        const txInfo: Transaction = {
            rawAmount: flow.type == 'deposit' ? rawAmount : -rawAmount,
            amount: flow.type === 'deposit' ? amountAbs : -amountAbs,
            timestamp: flow.timestamp,
            date: new Date(flow.timestamp * 1000)
        }
        if (existing) {
            existing.push(txInfo);
            groupedByUser[flow.owner] = existing;
        } else {
            groupedByUser[flow.owner] = [txInfo];
        }
    };

    console.log("total groups", Object.keys(groupedByUser).length);
    console.log("group1", groupedByUser[Object.keys(groupedByUser)[0]]);
    return groupedByUser;
}

async function OGFarmerNFTEligibleUsers() {
    const userGroups = await getInvestmentFlowsGroupedByUser();
    const eligibleUsers: any[] = [];
    Object.keys(userGroups).forEach((key) => {
        const userTxs = userGroups[key];
        if (hasThousandDollarsFor30Days(userTxs)) {
            eligibleUsers.push(key);
        }
    });
    console.log("Eligible users: ", eligibleUsers.length);
    console.log(eligibleUsers);
}
  
// run();
// dnmm()
// getInvestmentFlowsGroupedByUser();
// depositsAndWithdraws();
OGFarmerNFTEligibleUsers();