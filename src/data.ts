import { PrismaClient } from "@prisma/client";
import { writeFileSync, readFileSync} from 'fs';
import yahooFinance from 'yahoo-finance2';
import { getClosePriceAtTimestamp } from "./graphql/utils";
import { CairoCustomEnum, Contract, num, RpcProvider } from "starknet";
import pLimit from 'p-limit';

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
            contract: '0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b',
            block_number: {
                gt: 661768
            }
        }
    });
    // console.log(result);
    console.log(result.length);

    const xSTRK_DNMM = '0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b';
    const provider = new RpcProvider({
        nodeUrl: process.env.RPC_URL
    })
    let cls = await provider.getClassAt(xSTRK_DNMM);
    const contract = new Contract(cls.abi, xSTRK_DNMM, provider);
    let sum_shares = BigInt(0);
    const roundSharesMap: any = {};
    for (let i = 0; i < result.length; i++) {
        const action = result[i];
        const existing = roundSharesMap[action.owner];
        // ! bug fix, there was bad withdraw events, so 
        // ! we are fetching on-chain as on that block
        if (action.type == 'withdraw') {
            const result: any = await contract.call('describe_position', [
                num.getDecimalString(action.owner)
            ], {
                blockIdentifier: action.block_number
            });
            action.position_acc1_supply_shares = result['0'].acc1_supply_shares.toString()
            action.position_acc2_supply_shares = result['0'].acc2_supply_shares.toString()
            action.position_acc1_borrow_shares = result['0'].acc1_borrow_shares.toString()
            action.position_acc2_borrow_shares = result['0'].acc2_borrow_shares.toString()
        }

        const deposit_amount = Number(BigInt(action.assets) / BigInt(10 ** 16)) / 100;
        const shares_amount = (BigInt(action.position_acc2_supply_shares) / BigInt(10 ** 18)).toString();
        const prev_shares = existing ? existing.actions[existing.actions.length - 1].amount : BigInt(0);
        const ratio = (Number(shares_amount) - Number(prev_shares)) / deposit_amount;
        
        if (existing) {
            console.log('existing totalPoints', (existing.lpShares * BigInt(action.block_number - existing.block_number)).toString(), action.owner, existing.lpShares, action.block_number - existing.block_number, action.block_number, existing.block_number)
            existing.points += existing.lpShares * BigInt(action.block_number - existing.block_number);
            existing.lpShares = BigInt(action.position_acc2_supply_shares);
            const newPoints = existing.lpShares * BigInt(action.block_number - existing.block_number);
            console.log('newPoints', newPoints);
            existing.totalPoints = (BigInt(existing.totalPoints) + newPoints).toString();
            existing.block_number = action.block_number
            existing.actions.push({
                deposit_amount: deposit_amount,
                ratio,
                block: action.block_number,
                amount: shares_amount,
                fullAmount: action.position_acc2_supply_shares,
                type: action.type,
                diff: action.block_number - existing.actions[existing.actions.length - 1].block,
                txHash: action.txHash
            })
            roundSharesMap[action.owner] = existing;
        } else {
            roundSharesMap[action.owner] = {
                lpShares: BigInt(action.position_acc2_supply_shares),
                block_number: action.block_number,
                points: BigInt(0),
                firstBlock: action.block_number,
                totalPoints: "0",
                actions: [{
                    deposit_amount: deposit_amount,
                    ratio,
                    block: action.block_number,
                    amount: shares_amount,
                    fullAmount: action.position_acc2_supply_shares,
                    type: action.type,
                    diff: 0,
                    txHash: action.txHash
                }]
            }
        }
    }

    Object.keys(roundSharesMap).forEach((key) => {
        sum_shares += BigInt(roundSharesMap[key].lpShares)
        console.log(
            "key", key, 
            (BigInt(roundSharesMap[key].lpShares.toString()) / BigInt(10 ** 18)).toString(),
            (sum_shares / BigInt(10 ** 18)).toString()
        );
    })

    console.log("sum_shares", sum_shares.toString());
    let totalPoints = BigInt(0);
    // const CURRENT_BLOCK = 1078316; // 599523096360711574491812221
    const CURRENT_BLOCK = 1082221 // 2080676663758588100100255407 
    Object.keys(roundSharesMap).forEach((key) => {
        const existing = roundSharesMap[key];
        existing.points += existing.lpShares * BigInt(CURRENT_BLOCK - existing.block_number);
        existing.points = existing.points.toString()
        const newPoints = existing.lpShares * BigInt(CURRENT_BLOCK - existing.block_number);
        console.log('totalPoints', key, newPoints, existing.lpShares, existing.block_number)
        existing.totalPoints = (BigInt(existing.totalPoints) + newPoints).toString();
        console.log('totalPoints2', key, existing.totalPoints)
        existing.block_number = CURRENT_BLOCK;
        existing.lpShares = existing.lpShares.toString()
        existing.diff = existing.block_number - existing.firstBlock;
        roundSharesMap[key] = existing;
        totalPoints += BigInt(existing.points);
    })
    console.log("totalPoints", totalPoints.toString());
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
    date: Date,
    price: number;
    asset: string;
    txHash: string;
};
  
function hasThousandDollarsFor30Days(transactions: Transaction[]) {
    // Sort transactions by timestamp asc and amount desc
    transactions.sort((a, b) => a.timestamp - b.timestamp || b.amount - a.amount);
    
    let balance = transactions[0].amount;
    if (balance < 0) {
        console.log(transactions)
        throw new Error("First transaction is a withdraw");
    }
    let daysEligible = 0;
    
    console.log(`firstTx: ${transactions[0].amount} on ${transactions[0].date}`);
    for (let i = 1; i < transactions.length; i++) {
      const { amount, rawAmount, timestamp } = transactions[i];
      
      const timeDiff = transactions[i].timestamp - transactions[i-1].timestamp;
      const daysDiff = Math.floor(timeDiff / 86400);
      if (balance >= 950) {
        daysEligible += daysDiff;
        console.log("daysDiff", {daysDiff, i});
      }
      
      // Add the transaction to the balance
      balance += amount;
      if (balance < 0) {
        balance = 0;
      }

      if (daysEligible >= 30) {
        return {
            lastTime: transactions[i].timestamp,
            daysEligible
        };
      }
    }
    return {
        lastTime: 0,
        daysEligible
    }
}

const tokenKeyMap: any = {
    "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": {
        yFinanceKey: 'STRK22691-USD',
        decimals: 18
    },
    "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": {
        yFinanceKey: null,
        decimals: 6
    },
    "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": {
        yFinanceKey: 'ETH-USD',
        decimals: 18
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
        const results = await yahooFinance.chart(key, {
            period1: '2024-02-01',
        });

        priceHistory[tokenAddress] = results.quotes;
        const priceInfo = getClosePriceAtTimestamp(results.quotes, timestamp);
        return priceInfo;
    } else {
        const priceInfo = getClosePriceAtTimestamp(prices, timestamp);
        // console.log(`priceInfo`, priceInfo)
        return priceInfo;
    }
}

async function getInvestmentFlowsGroupedByUser(users: string[] | null = null) {
    const prisma = new PrismaClient();

    const filter: any = {
        orderBy: {
            timestamp: 'asc'
        }
    };
    if (users && users.length) {
        filter.where = {
            owner: {
                in: users
            }
        }
    }

    const investmentFlows = await prisma.investment_flows.findMany(filter);
    console.log('invvv', investmentFlows);

    let cutoffTime = Math.round(new Date().getTime() / 1000) - (86400 * 2);
    const groupedByUser: any = {};
    for (let i = 0; i < investmentFlows.length; i++) {
        const flow = investmentFlows[i];
        const existing = groupedByUser[flow.owner];
        const decimals = tokenKeyMap[flow.asset].decimals;
        const rawAmount = Number(((BigInt(flow.amount) * BigInt(1000))/ BigInt(10 ** decimals)).toString()) / 1000;
        if (flow.timestamp > cutoffTime) {
            continue;
        }
        const price: number | null = await getPrice(flow.asset, flow.timestamp);
        if (!price) {
            console.error("Price not found for flow: ", flow);
            return;
        }
        const amountAbs = rawAmount * price;
        console.log('price', price)
        const txInfo: Transaction = {
            rawAmount: flow.type == 'deposit' ? rawAmount : -rawAmount,
            amount: flow.type === 'deposit' ? amountAbs : -amountAbs,
            timestamp: flow.timestamp,
            date: new Date(flow.timestamp * 1000),
            price,
            asset: flow.asset,
            txHash: flow.txHash
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

async function OGFarmerNFTEligibleUsers(users: string[] | null = null) {
    const userGroups = await getInvestmentFlowsGroupedByUser(users);

    const eligibleUsers: {address: string, time: number, daysEligible: number}[] = [];
    console.log(userGroups)
    Object.keys(userGroups).forEach((key) => {
        const userTxs = userGroups[key];
        const processedTx = updateWithdrawalAmountsUsingFIFO(userTxs);
        let info = hasThousandDollarsFor30Days(processedTx);
        if (info.lastTime)
            eligibleUsers.push({address: key, time: info.lastTime, daysEligible: info.daysEligible});
    });
    console.log("Eligible users: ", eligibleUsers.length);
    eligibleUsers.sort((a, b) => a.time - b.time);
    console.log(eligibleUsers);
    writeFileSync('eligibleUsers.json', JSON.stringify(eligibleUsers));
    return eligibleUsers;
}

async function impact() {
    const provider = new RpcProvider({
        nodeUrl: process.env.RPC_URL
    });
    const contract = new Contract(
        [{
            "name": "balanceOf",
            "type": "function",
            "inputs": [
              {
                "name": "account",
                "type": "core::starknet::contract_address::ContractAddress"
              },
              {
                "name": "tokenId",
                "type": "core::integer::u256"
              }
            ],
            "outputs": [
              {
                "type": "core::integer::u256"
              }
            ],
            "state_mutability": "view"
        }],
        '0x0183649acdbbbc303d6cd5a4cec91c8ea08f4f63d6e1927d6d63fef07ef35080',
        provider,
    )

    const eligibleUsers = await OGFarmerNFTEligibleUsers();
    console.log('eligible users: ', eligibleUsers.length);

    const _balances: any[] = [];
    for (let i = 0; i < eligibleUsers.length; i++) {    
        console.log(`Fetching balance for ${eligibleUsers[i]}, index: `, i);
        const address = eligibleUsers[i].address;
        let retry = 0;
        while (retry < 30) {
            try {
                const balance = await contract.balanceOf(address, BigInt(1));
                console.log(`Balance for ${address}: ${balance}`);
                _balances.push({
                    balance, address
                });
                break;
            } catch (e) {
                console.error(`Error fetching balance for ${address}, retrying... ${retry}, index: `, i);
                retry++;
                await new Promise((resolve) => setTimeout(resolve, 10000));
                if (retry === 30) {
                    throw e;
                }
            }
        }
    };

    const selectedUsers = JSON.parse(readFileSync('selectedUsers.json', {
        encoding: 'utf-8'
    })).map(standariseAddress);

    for (let i = 0; i < selectedUsers.length; i++) {
        const user = selectedUsers[i];
        if (!_balances.find((b) => b.address === user)) {
            const balance = await contract.balanceOf(user, BigInt(1));
            console.log(`Balance for ${user}: ${balance}`);
            _balances.push({
                balance, address: user
            });
        }
    }

    // const balances = _balances.filter((item) => item.balance > 0);
    _balances.sort((a, b) => Number(b.balance) - Number(a.balance));
    console.log(_balances);
    writeFileSync('balances.json', JSON.stringify(_balances.map(b => ({balance: b.balance.toString(), address: b.address}))));
    
    
    // excess addresses
    // [
    //     {
    //       balance: 1n,
    //       address: '0x7364ce0a8aab411beddf7780f222b3508af4daf5c542bb258e9fe55ae5846ba'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x3d87ee70baf292cdc23c654153cfd711ff580a076d1dccc0dfd9d3eb62df311'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x63d87659aeb300ce268e872fd16d3d2ad5821444c438fae86f2b1fc39d26c17'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x6afcff37fe09b4d92f834475c70452c91ede180ddd387ec09191333f1f908a'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x6857c54d51eb6410f3a4974fc7f89b7735f4b135c587d62ca8bb725b7848bb9'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x6d1b40ae61ee3c2e794b9a5ff209d91c48e11618151260151b83813f3895faf'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x58e058cc515404046b9a125531b92dfb9542b02829447381483520df7e7e39e'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x1946919d894c240c092ac613978a51555cdaf797f81b9773232a666cd5c2df7'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x77832660869c622a3b7eb88c4feef1e182ab67a3e64e65fba3e97f761593fe1'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x469ae106636a21207ba4666453383629b063527efa2f2cb7f276192e8d885ff'
    //     },
    //     {
    //       balance: 1n,
    //       address: '0x551533735edca74e90d4b055a4987c89fde8f65a497c02d621e306b0ab7567d'
    //     }
    // ]
}

export function standariseAddress(address: string | bigint) {
    let _a = address;
    if (!address) {
        _a = "0";
    }
    const a = num.getHexString(num.getDecimalString(_a.toString()));
    return a;
}

async function impact2() {
    const selectedUsers = JSON.parse(readFileSync('selectedUsers.json', {
        encoding: 'utf-8'
    })).map(standariseAddress);
    const eligibleUsers = JSON.parse(readFileSync('eligibleUsers.json', {
        encoding: 'utf-8'
    }));
    const balances = JSON.parse(readFileSync('balances.json', {
        encoding: 'utf-8'
    }));
    // should have been in selected list, but are not
    // let count = 0;
    // for (let i=0; i<100; i++) {
    //     const user = eligibleUsers[i];
    //     if (!selectedUsers.includes(standariseAddress(user.address))) {
    //         console.log(user);
    //         // const txInfo = await getInvestmentFlowsGroupedByUser([user.address]);
    //         // console.log(txInfo);
    //         // return;
    //         count += 1;
    //     }
    // }
    // console.log(count);

    const new_list: string[] = [];
    balances.forEach((balance: any) => {
        if (balance.balance > 0) {
            new_list.push(standariseAddress(balance.address));
        }
    });
    console.log(`claimed_users: ${new_list.length}`);

    const MAX = 97;
    // add non claimed users from eligible list
    for (let i = 0; i < eligibleUsers.length; i++) {
        const user = eligibleUsers[i];
        const condition1 = !selectedUsers.includes(standariseAddress(user.address));
        const condition2 = !new_list.includes(standariseAddress(user.address));
        if (condition1 && condition2) {
            new_list.push(standariseAddress(user.address));
            if (new_list.length >= MAX) {
                break;
            }
        }
    }

    writeFileSync('current_list.json', JSON.stringify(new_list));

    // are in selected list, but should not be
    // let count = 0;
    // for (let i=0; i<selectedUsers.length; i++) {
    //     const user = selectedUsers[i];
    //     if (!eligibleUsers.find((u: any) => standariseAddress(u.address) === user)) {
    //         console.log(user);
    //         const txInfo = await getInvestmentFlowsGroupedByUser([user]);
    //         console.log(txInfo);
    //         count += 1;
    //     }
    // }
    // console.log(count);
}
  
function updateWithdrawalAmountsUsingFIFO(transactions: Transaction[]): Transaction[] {
    // Group transactions by asset
    const assetTransactions: { [key: string]: Transaction[] } = {};
    
    for (const tx of transactions) {
        if (!assetTransactions[tx.asset]) {
            assetTransactions[tx.asset] = [];
        }
        assetTransactions[tx.asset].push({...tx});
    }
    
    // Process each asset separately
    for (const asset in assetTransactions) {
        const txs = assetTransactions[asset];
        let depositQueue: Array<{amount: number, price: number}> = [];
        
        for (let i = 0; i < txs.length; i++) {
            const tx = txs[i];
            
            if (tx.rawAmount > 0) {  // Deposit
                depositQueue.push({
                    amount: tx.rawAmount,
                    price: tx.price
                });
            } else {  // Withdrawal
                let remainingWithdrawal = Math.abs(tx.rawAmount);
                let totalUsdAmount = 0;
                
                while (remainingWithdrawal > 0 && depositQueue.length > 0) {
                    const oldestDeposit = depositQueue[0];
                    
                    if (oldestDeposit.amount <= remainingWithdrawal) {
                        // Use entire deposit
                        totalUsdAmount += oldestDeposit.amount * oldestDeposit.price;
                        remainingWithdrawal -= oldestDeposit.amount;
                        depositQueue.shift();
                    } else {
                        // Use partial deposit
                        totalUsdAmount += remainingWithdrawal * oldestDeposit.price;
                        oldestDeposit.amount -= remainingWithdrawal;
                        remainingWithdrawal = 0;
                    }
                }
                
                if (remainingWithdrawal < 0) {
                    throw new Error("Remaining withdrawal is negative");
                }

                // Update the withdrawal transaction with new USD amount
                txs[i].amount = -totalUsdAmount - (remainingWithdrawal * tx.price);
            }
        }

        // in the end, add remaining deposits to the last withdrawal
        if (depositQueue.length > 0) {
            let totalUsdAmount = 0;
            for (const deposit of depositQueue) {
                totalUsdAmount += deposit.amount * deposit.price;
            }
            txs.push({
                rawAmount: depositQueue.reduce((acc, deposit) => acc + deposit.amount, 0),
                amount: totalUsdAmount,
                timestamp: Math.round(new Date().getTime() / 1000),
                date: new Date(),
                price: depositQueue[depositQueue.length - 1].price,
                asset: asset,
                txHash: "0x0"
            })
            assetTransactions[asset] = txs;
        }
    }
    
    // Flatten and return sorted transactions
    return Object.values(assetTransactions)
        .flat()
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function assertTotalShares() {
    const addr = '0x04937b58e05a3a2477402d1f74e66686f58a61a5070fcc6f694fb9a0b3bae422'
    const provider = new RpcProvider({
        nodeUrl: process.env.MAINNET_RPC_URL
    });
    const cls = await provider.getClassAt(addr);
    const contract = new Contract(cls.abi, addr, provider);
    const limit = pLimit(10);

    const all_shares: any = await contract.call('get_all_shares', [], {
        blockIdentifier: 1192086
    });
    console.log(all_shares);
    
    const prisma = new PrismaClient();
    const txs = await prisma.investment_flows.findMany({
        where: {
            contract: standariseAddress(addr),
        },
        select: {
            owner: true,
        }
    })
    const uniqueUsers = Array.from(new Set(txs.map((tx) => tx.owner)));
    console.log(`uniqueUsers: ${uniqueUsers.length}`);

    let sum_shares_supply = BigInt(0);
    let sum_shares_borrow = BigInt(0);
    let sharesByUser: any[] = [];
    let totalClaimAmount = BigInt(0);
    const promises = uniqueUsers.map((user, i) => {
        return limit(async () => {
            const user = uniqueUsers[i];
            const MAX = 3;
            let retry = 0;
            while (retry < MAX) {
                try {
                    const shares: any = await contract.call('describe_position', [num.getDecimalString(user)], {
                        blockIdentifier: 1192086
                    })

                    let claimAmount: any = await contract.call('nostra_position', [user], {
                        blockIdentifier: 1192086
                    });
                    
                    sum_shares_supply += shares[0].acc1_supply_shares
                    sum_shares_borrow += shares[0].acc2_borrow_shares
                    const size = shares[1].estimated_size;
                    
                    console.log(`User: ${user}`);
                    console.log(`shares for ${i}/${uniqueUsers.length}, ${user}:`, shares[0].acc1_supply_shares.toString(), shares[0].acc2_borrow_shares.toString(), size.toString());
                    console.log(`sum_shares_supply: ${sum_shares_supply.toString()}, sum_shares_borrow: ${sum_shares_borrow.toString()}`);
                    sharesByUser.push({
                        user,
                        supply: shares[0].acc1_supply_shares.toString(),
                        borrow: shares[0].acc2_borrow_shares.toString(),
                        size: size.toString()
                    })

                    totalClaimAmount += claimAmount;
                    break;
                } catch (e) {
                    console.error(`Error fetching shares for ${user}, retrying... ${retry}`);
                    retry++;
                    await new Promise((resolve) => setTimeout(resolve, 10000));
                    if (retry === MAX) {
                        throw e;
                    }
                }
            }
        });
    })
    const result = await Promise.all(promises);
    console.log('done');

    // sort descending on borrow
    sharesByUser.sort((a, b) => Number((BigInt(b.borrow) - BigInt(a.borrow))));
    console.log(JSON.stringify(sharesByUser, null, 2));

    console.log(`totalClaimAmount: ${totalClaimAmount.toString()}`);

    // assert sum is less then total shares and 1000 max diff
    const diff = all_shares.acc2_borrow_shares - sum_shares_borrow;
    console.log(`diff: ${diff.toString()}`);
    if (diff > 1000n || diff < 0n) {
        throw new Error(`Total shares mismatch: ${diff}`);
    }

    const diff2 = all_shares.acc1_supply_shares - sum_shares_supply;
    console.log(`diff2: ${diff2.toString()}`);
    if (diff2 > 1000n || diff2 < 0n) {
        throw new Error(`Total shares mismatch: ${diff2}`);
    }

}

async function getPrices() {

    const prisma = new PrismaClient();
    const results = await prisma.dnmm_user_actions.findMany({
        orderBy: {
            block_number: 'asc'
        },
        where: {
            contract: '0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b',
        }
    });

    console.log(results.length);
    // for (let result of results) {
    //     const supply = result.position_acc2_supply_shares;
    //     const borrow = result.position_acc2_borrow_shares;
    //     if (supply === '0' || borrow === '0') {
    //         continue;
    //     }
    //     const ratio = BigInt(supply) * 10000n / BigInt(borrow);
    //     if (ratio <= 10000n) {
    //         console.log(ratio.toString());
    //         console.log(result);
    //     }
    // }

    // const uniqueOwners = new Set(results.map((result) => result.owner));
    // console.log(`uniqueOwners: ${uniqueOwners.size}`);
    // writeFileSync('uniqueOwners.json', JSON.stringify(Array.from(uniqueOwners), null, 2));
    // return;

    const uniqueOwners = JSON.parse(readFileSync('uniqueOwners.json', {
        encoding: 'utf-8'
    }));
    console.log(`uniqueOwners: ${uniqueOwners.length}`);
    const provider = new RpcProvider({
        nodeUrl: process.env.RPC_URL
    });
    const xSTRK_DNMM = '0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b';
    const cls = await provider.getClassAt(xSTRK_DNMM);
    const contract = new Contract(cls.abi, xSTRK_DNMM, provider);


    const positions: any[] = [];
    let loss = 0;
    let count = 0;
    for (let owner of uniqueOwners) {
        console.log(`Fetching position for ${owner}`);
        try {
            const result: any = await contract.call('describe_position', [
                num.getDecimalString(owner)
            ]);
            const size = result[1].estimated_size;

            const investment_flows = await prisma.investment_flows.findMany({
                where: {
                    owner: owner,
                    contract: '0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b',
                }
            });
            if (investment_flows.length == 0) {
                throw new Error(`No investment flows for ${owner}`);
            }

            const sum = investment_flows.reduce((acc, flow) => {
                if (flow.type === 'deposit') {
                    return acc + BigInt(flow.amount);
                } else {
                    return acc - BigInt(flow.amount);
                }
            }, 0n);

            const sumNum = Number(sum) / 10**18;
            const sizeNum = Number(size) / 10**18;
            const diff = sizeNum - sumNum;
            positions.push({
                owner: owner,
                sum: sumNum,
                size: sizeNum,
                diff: diff,
                percent: sizeNum < 10 ? 0 : diff * 100 / sizeNum,
                actions: investment_flows.map((flow) => ({
                    type: flow.type,
                    amount: Number(flow.amount) / 10**18,
                    txHash: flow.txHash,
                }))
            });
            console.log(`sum: ${sumNum}`);
            console.log(`size: ${sizeNum}`);
            console.log(`diff: ${diff}`);
            if (diff < 0) {
                loss += Number(diff);
                count += 1;
            }
            console.log(`loss: ${loss}`);
            console.log(`count: ${count}`);

            positions.sort((a, b) => Number(a.percent - Number(b.percent)));
            writeFileSync('positions.json', JSON.stringify(positions, null, 2));
        
        } catch(err) {
            console.error(`Error fetching position for ${owner}: ${err}`);
        }
    }

   
    // let summary = ISummaryStatsABIDispatcher { contract_address: self.summary_address.read() };
    //             let (value, decimals) = summary
    //                 .calculate_twap(
    //                     DataType::SpotEntry(pragma_key),
    //                     aggregation_mode,
    //                     time_window,
    //                     get_block_timestamp() - start_time_offset
    //                 );

    // const provider = new RpcProvider({
    //     nodeUrl: process.env.RPC_URL
    // });
    // const pragmaTWAP = '0x049eefafae944d07744d07cc72a5bf14728a6fb463c3eae5bca13552f5d455fd'
    // const cls = await provider.getClassAt(pragmaTWAP);
    // const pragmaContract = new Contract(cls.abi, pragmaTWAP, provider);

    // const ekuboCore = '0x00000005dd3D2F4429AF886cD1a3b08289DBcEa99A294197E9eB43b0e0325b4b'
    // const ekuboCoreCls = await provider.getClassAt(ekuboCore);
    // const ekuboCoreContract = new Contract(ekuboCoreCls.abi, ekuboCore, provider);

    // const START_BLOCK = 1165330;
    // const now = await provider.getBlockNumber();

    // const ekuboPriceInfo: any[] = [];
    // const limit = pLimit(10);
    
    // const promises: any[] = [];
    // for (let ii = START_BLOCK; ii < now; ii += 1) {
    //     const fn = async (block: number) => {
    //         console.log(`block: ${block}`);
    //         const result: any = await ekuboCoreContract.call('get_pool_price', [
    //             {
    //                 token0: '0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a',
    //                 token1: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    //                 fee: '34028236692093847977029636859101184',
    //                 tick_spacing: '200',
    //                 extension: '0'
    //             }
    //         ], {
    //             blockIdentifier: block
    //         });
    //         console.log(result);
    //         ekuboPriceInfo.push({
    //             block: block,
    //             sqrtPrice: result.sqrt_ratio.toString(),
    //             tick: {mag: result.tick.mag.toString(), sign: result.tick.sign},
    //         });

    //         if (block % 100 === 0) {
    //             writeFileSync('ekuboPriceInfo.json', JSON.stringify(ekuboPriceInfo));
    //         }

    //         // const keyEnum = new CairoCustomEnum({ SpotEntry: 1629317993172502401860 });
    //         // const aggregationEnum = new CairoCustomEnum({ Median: {} });
    //         // const blockInfo = await provider.getBlock(i);
    //         // const result = await pragmaContract.call('calculate_twap', [
    //         //     keyEnum,
    //         //     aggregationEnum,
    //         //     blockInfo.timestamp,
    //         //     blockInfo.timestamp - 3600
    //         // ], {
    //         //     blockIdentifier: i
    //         // });
    //         // console.log(result);
    //     }
    //     promises.push(limit(fn, ii));
    // }

    // const result = await Promise.all(promises);
    // writeFileSync('ekuboPriceInfo.json', JSON.stringify(ekuboPriceInfo));
}

// run();
// dnmm()
// getInvestmentFlowsGroupedByUser();
// depositsAndWithdraws();
// OGFarmerNFTEligibleUsers();
// impact();
// impact2();
assertTotalShares();
// getPrices();