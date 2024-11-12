import { PrismaClient } from "@prisma/client";
import { writeFileSync } from 'fs';
import yahooFinance from 'yahoo-finance2';
import { getClosePriceAtTimestamp } from "./graphql/utils";
import { Contract, RpcProvider } from "starknet";

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
    
    transactions.push({
        amount: transactions[transactions.length - 1].amount,
        timestamp: Math.floor(Date.now() / 1000),
        rawAmount: transactions[transactions.length - 1].rawAmount,
        date: new Date()
    });

    let balance = transactions[0].amount;
    let daysEligible = 0;
    
    console.log(`firstTx: ${transactions[0].amount} on ${transactions[0].date}`);
    for (let i = 1; i < transactions.length; i++) {
      const { amount, timestamp } = transactions[i];
      
      const timeDiff = transactions[i].timestamp - transactions[0].timestamp;
      const daysDiff = Math.floor(timeDiff / 86400);
      if (balance >= 950) {
        daysEligible += daysDiff;
        console.log("daysDiff", {daysDiff, i});
      }
      
      // Add the transaction to the balance
      balance += amount;

      if (daysEligible >= 30) {
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

async function OGFarmerNFTEligibleUsers(users: string[] | null = null) {
    const userGroups = await getInvestmentFlowsGroupedByUser(users);

    const eligibleUsers: any[] = [];
    console.log(userGroups)
    Object.keys(userGroups).forEach((key) => {
        const userTxs = userGroups[key];
        if (hasThousandDollarsFor30Days(userTxs)) {
            eligibleUsers.push(key);
        }
    });
    console.log("Eligible users: ", eligibleUsers.length);
    console.log(eligibleUsers);
    writeFileSync('eligibleUsers.json', JSON.stringify(eligibleUsers));
}

async function impact() {
    const actual = [
        '0x52a2dffcfa271420af69ae50b13345ccaa38fc04b09f350f33c8d0e3850a232',
        '0x5b55db55f5884856860e63f3595b2ec6b2c9555f3f507b4ca728d8e427b7864',
        '0x5095078578a59f8a9c17df97188db1b59574c6d4836dd3e705fe8537624228a',
        '0x18489438975ee3c6bc18add415d7889a9630547398f26bb5dee27481216a67d',
        '0x4cced5156ab726bf0e0ca2afeb1f521de0362e748b8bdf07857b088dbc7b457',
        '0x43fbdfdd75f2726f999ad87833ca6372261b200e956cd8df7986e4fc518d0eb',
        '0x4d1740c01d87e64d7b5149616724bfe24537e200b3f13f6b8b8e760d0ec742',
        '0x29dbf109d0f4c8fa807c14e867df953ab3bc9b39d9f66e9a13f1922d10243bb',
        '0x708a705b8ee042cde294269c20f65790a9bb535e6e76b9df600821e322e03cf',
        '0x36aa3388e7da64d6adf08653abc5699f681ffedacd7938d2e115f73919be294',
        '0x47ab88662a0173b6014bfc41f7479cf8f973a7212fe5bc9abf8f40138c0c979',
        '0x46d703df4dd4e1b8196b294ec295c8c66097836cd4085372299ac53dff5d478',
        '0x11dfbced0c610ae46447105b97477b93e9bbc2f346980c7de51d3622f310201',
        '0x3950ce99fa8c34188f591d55ccbeafb109c6215cb33f37f5b22d14d1462ae9c',
        '0x55741fd3ec832f7b9500e24a885b8729f213357be4a8e209c4bca1f3b909ae',
        '0x91549c2fe52f07266a21228406131df81b39a7f4793cf23c8cb30d4c667850',
        '0x22202a0ee56bfc70ab7ab767f14b980357e482bc280ba10ec375172fe1b0bf8',
        '0x578ecc0659983818087560740a0842e846a516962231cbef4658735adb9063c',
        '0x5caa422de56ffa4d6bbcf8cea2d8c7a3d0c490edf2155d3b29a68d9ddc55479',
        '0x7a900c5b496d15bbb1c3c69d090e890a4b19dbceabee72232d4f2bec67ff4c',
        '0x7f5d5b58f2a1c504f6a8d0e47269c903485582308b6f3415c27a561e0d1a6fa',
        '0x17603b7963b1e2357a57e3c16f83abacef6bd8cf59e5394c34ae72ce566da2',
        '0x27391b415a803a1aa7fffbed7db19336cf4b7f9bb1d3468986eef9a26341356',
        '0x4bbdde9359d8bc7e513f510f9080306dbf267acb41228a4706d1b55f2fd065d',
        '0x4015548595f22ccf56f6f42ada31a5d8eb7cb307c4e9e550b578d44fa25bcc',
        '0x50393e851e40de930abcd9569d9df55883b9f2836d4bae724f126d2258cd292',
        '0x6664321c527c75bdc76ba47a9620808ce810abc2aded699a59a1d81c90f3504',
        '0x720eba8edea43289347d8cc5518a1944b3eb5c9bde8f255c4946f9ff21d782d',
        '0x2915ca6c218df8b394237b278cc920668fd504268494e1ebcf108a660cd7136',
        '0x552760d9b7d629e2daf636129fb519ac17a739e1a1fa05ee928ccb1f62c26cf',
        '0x5d13967477c18e3af591c71f10163fca12360c99d9f1c1c48e9c8626742dee',
        '0x14f59c23735b4aaaf6b6c0df567cacff9adc27f50dcb8b5270cf1237605c263',
        '0x6733e297fe300f78f48c7106ad550626377aa732cef360867218c08a536ea5e',
        '0x1ca34f742a91a588a3e770c8c8c8618a0713d7f64fda7935d42dcfcf4adffa0',
        '0x571d4b6f5a34d7a43517d2eca4166804f753a643ec28bec0f51143bef50a9a6',
        '0x6a98eef8b1ce965ec9f6daf4c896f5c21217f2365652c30d462b13a1858ed7c',
        '0x5105649f42252f79109356e1c8765b7dcdb9bf4a6a68534e7fc962421c7efd2',
        '0x36177b6741a43c219602ce857c18e445920d5a6ea5f4ee3a0240e8ae319bbf5',
        '0x47ccae4b7dccabd0689624812f7deeb3ed283dc3349b826974ff88107d71f4c',
        '0x9fb60ac230ceeda227d28f138e327d2509d01531d20d9c8b2c4a7bf65afd8c',
        '0x679316db27cdb5d579d0508859ce450db3c2a2483e3628f7c1fc80b52e87634',
        '0x640822d69e5c3e6ecb549de81d95bae4ccee96a4b8b3fa61932d2f3ebcdce8d',
        '0x1f13873d0e2ff24321ca91d0530f093c25dc7b52d9316df8c2ec1a17fbfb5c1',
        '0x7342070d73d4ceef7e7c84420acb3026720e88fef10302fc11fd25a7ee0b715',
        '0x2b27457428b94b38ccad5339ebc17a211b7c482c008ac8ad22e01b30e923628',
        '0x67b72d3df972e5816b07ad4794af8e85c968409554281880149e96f09df1d56',
        '0x1eb945a1b881a2d8f8d8ea5eada7ec42c999ab5e5ed225af7b62f00865bafbd',
        '0x73298a2ca8b06596d7bc85311c1c9d06458664a02a341655dee4e663600ac53',
        '0x16d730875c5dd15f3c1086523683bf5463fc11572405c8bee6e1ec65bead84e',
        '0x4d1b676e430b55175ce9ecbe073486a15411a8605c99aff8a14804fd4088da5',
        '0x147b941bec50a2b497eb1bd966cf36e33ad3da7e508ebd5ea994978fa5be5a6',
        '0x5a39462a82784de9f0f30c356f3fd5dfe71c7fa510bf22e8893cec254f59fc2'
    ]

    const original = [
        "0x52a2dffcfa271420af69ae50b13345ccaa38fc04b09f350f33c8d0e3850a232",
        "0x5b55db55f5884856860e63f3595b2ec6b2c9555f3f507b4ca728d8e427b7864",
        "0x5095078578a59f8a9c17df97188db1b59574c6d4836dd3e705fe8537624228a",
        "0x18489438975ee3c6bc18add415d7889a9630547398f26bb5dee27481216a67d",
        "0x4cced5156ab726bf0e0ca2afeb1f521de0362e748b8bdf07857b088dbc7b457",
        "0x43fbdfdd75f2726f999ad87833ca6372261b200e956cd8df7986e4fc518d0eb",
        "0x4d1740c01d87e64d7b5149616724bfe24537e200b3f13f6b8b8e760d0ec742",
        "0x29dbf109d0f4c8fa807c14e867df953ab3bc9b39d9f66e9a13f1922d10243bb",
        "0x708a705b8ee042cde294269c20f65790a9bb535e6e76b9df600821e322e03cf",
        "0x36aa3388e7da64d6adf08653abc5699f681ffedacd7938d2e115f73919be294",
        "0x47ab88662a0173b6014bfc41f7479cf8f973a7212fe5bc9abf8f40138c0c979",
        "0x46d703df4dd4e1b8196b294ec295c8c66097836cd4085372299ac53dff5d478",
        "0x11dfbced0c610ae46447105b97477b93e9bbc2f346980c7de51d3622f310201",
        "0x3950ce99fa8c34188f591d55ccbeafb109c6215cb33f37f5b22d14d1462ae9c",
        "0x55741fd3ec832f7b9500e24a885b8729f213357be4a8e209c4bca1f3b909ae",
        "0x91549c2fe52f07266a21228406131df81b39a7f4793cf23c8cb30d4c667850",
        "0x22202a0ee56bfc70ab7ab767f14b980357e482bc280ba10ec375172fe1b0bf8",
        "0x578ecc0659983818087560740a0842e846a516962231cbef4658735adb9063c",
        "0x5caa422de56ffa4d6bbcf8cea2d8c7a3d0c490edf2155d3b29a68d9ddc55479",
        "0x7a900c5b496d15bbb1c3c69d090e890a4b19dbceabee72232d4f2bec67ff4c",
        "0x7f5d5b58f2a1c504f6a8d0e47269c903485582308b6f3415c27a561e0d1a6fa",
        "0x17603b7963b1e2357a57e3c16f83abacef6bd8cf59e5394c34ae72ce566da2",
        "0x4bbdde9359d8bc7e513f510f9080306dbf267acb41228a4706d1b55f2fd065d",
        "0x4015548595f22ccf56f6f42ada31a5d8eb7cb307c4e9e550b578d44fa25bcc",
        "0x50393e851e40de930abcd9569d9df55883b9f2836d4bae724f126d2258cd292",
        "0x720eba8edea43289347d8cc5518a1944b3eb5c9bde8f255c4946f9ff21d782d",
        "0x2915ca6c218df8b394237b278cc920668fd504268494e1ebcf108a660cd7136",
        "0x552760d9b7d629e2daf636129fb519ac17a739e1a1fa05ee928ccb1f62c26cf",
        "0x14f59c23735b4aaaf6b6c0df567cacff9adc27f50dcb8b5270cf1237605c263",
        "0x6733e297fe300f78f48c7106ad550626377aa732cef360867218c08a536ea5e",
        "0x1ca34f742a91a588a3e770c8c8c8618a0713d7f64fda7935d42dcfcf4adffa0",
        "0x571d4b6f5a34d7a43517d2eca4166804f753a643ec28bec0f51143bef50a9a6",
        "0x6a98eef8b1ce965ec9f6daf4c896f5c21217f2365652c30d462b13a1858ed7c",
        "0x5105649f42252f79109356e1c8765b7dcdb9bf4a6a68534e7fc962421c7efd2",
        "0x36177b6741a43c219602ce857c18e445920d5a6ea5f4ee3a0240e8ae319bbf5",
        "0x47ccae4b7dccabd0689624812f7deeb3ed283dc3349b826974ff88107d71f4c",
        "0x9fb60ac230ceeda227d28f138e327d2509d01531d20d9c8b2c4a7bf65afd8c",
        "0x640822d69e5c3e6ecb549de81d95bae4ccee96a4b8b3fa61932d2f3ebcdce8d",
        "0x1f13873d0e2ff24321ca91d0530f093c25dc7b52d9316df8c2ec1a17fbfb5c1",
        "0x7342070d73d4ceef7e7c84420acb3026720e88fef10302fc11fd25a7ee0b715",
        "0x2b27457428b94b38ccad5339ebc17a211b7c482c008ac8ad22e01b30e923628",
        "0x67b72d3df972e5816b07ad4794af8e85c968409554281880149e96f09df1d56",
        "0x1eb945a1b881a2d8f8d8ea5eada7ec42c999ab5e5ed225af7b62f00865bafbd",
        "0x73298a2ca8b06596d7bc85311c1c9d06458664a02a341655dee4e663600ac53",
        "0x297268ffc3c342f9c7fa3df6a5a6ef63ef5a5232ceaaf67168df686283effca",
        "0x16d730875c5dd15f3c1086523683bf5463fc11572405c8bee6e1ec65bead84e",
        "0x4d1b676e430b55175ce9ecbe073486a15411a8605c99aff8a14804fd4088da5",
        "0x147b941bec50a2b497eb1bd966cf36e33ad3da7e508ebd5ea994978fa5be5a6",
        "0x5a39462a82784de9f0f30c356f3fd5dfe71c7fa510bf22e8893cec254f59fc2",
        "0x7364ce0a8aab411beddf7780f222b3508af4daf5c542bb258e9fe55ae5846ba",
        "0x3d87ee70baf292cdc23c654153cfd711ff580a076d1dccc0dfd9d3eb62df311",
        "0x63d87659aeb300ce268e872fd16d3d2ad5821444c438fae86f2b1fc39d26c17",
        "0x6afcff37fe09b4d92f834475c70452c91ede180ddd387ec09191333f1f908a",
        "0x6857c54d51eb6410f3a4974fc7f89b7735f4b135c587d62ca8bb725b7848bb9",
        "0x7d00006aa2eaedb8f89a1745732bcd966b3bfde48094fd616b23cac21960e2b",
        "0x53f7a43286d4c5a2c5104b44ccb7b9e103ea915a96c6a1f6870a7c6c2206d99",
        "0x2321807e25b3ef5ddd835e23696cc13a645405baec4cd8b918323704a870cc9",
        "0x367c0c4603a29bc5aca8e07c6a2776d7c0d325945abb4f772f448b345ca4cf7",
        "0x5e2ceca0361cc280ae6c67fcbc2bc8f1d052d81590ef730232f13d6ebf5fbd2",
        "0x3d0925e3d88cec40c818b5388fca09094bca0f3b2ee71c5d8459c79f6ead07",
        "0x64fb7f85fd9dee10c313696b0aef1f4afc888ce8422edbc2f1695ec5ed152e9",
        "0x3bb0ee1ace26d86a9045872166f145dcb9ab4d37da9bdf76f6fe11ab129f0c8",
        "0x1af714eed6c7e26bf8f794fc75c0e2f5f25dbca13b9875a344a97e64cccaec1",
        "0x6d1b40ae61ee3c2e794b9a5ff209d91c48e11618151260151b83813f3895faf",
        "0x745fc3081d4e195e41c6c44fcb6a56d28d9d2fa683101cb2bc820bbeb7f91fd",
        "0x58e058cc515404046b9a125531b92dfb9542b02829447381483520df7e7e39e",
        "0x1f88cf149991c7768351fdf9c2bd80a56814a2b9a15e73e93c25d811b234f99",
        "0x7c66aa1538776dde4329a24a92fb8ff668a43e64cb129bfda432902ea7450b1",
        "0x7ec7d67d0e663c9ec4a45659b3db47f9ac594b40b9c91d24704dfe536277304",
        "0x53b36f0c83047272633c00db0f5db890dd4bec745446dc17dabbc6828e403a2",
        "0xb1ddd66dfd43f359706730088685770a2dc23ba097d56837d06efe6004247e",
        "0x7e5dab3252f7b6340c268fc9f9687252cc85aaffdb932308a08909229f14dba",
        "0x4fa35d249be21384b7c67912d29ec95dd289230ed7dcfdcb08b215bc5b77bfd",
        "0x50bc2a8957855ba8fd915068bdd3e829f07c755eeb845de75b204257b970181",
        "0x614872dd2f3324f3e9a047d0cfaab9e9573bbdfa6081877f49f7108116b8ae0",
        "0x14dfc4e19d57c72220bb04f58e7a47588f878a840d7532627473b9c85633f36",
        "0x6ef7b7dc9a060cb84ab2ed2d5fa1dce386ee56bc00296f4a934be64c3b1eb29",
        "0x52e103c5835618c95269f80a39786a7251ca14b8056a360cfb5147ffec24d74",
        "0x3072de7549420ea000fdea27f8d2882d6179fa6c1967d0fda54e76eeaed7fd2",
        "0x474b29e7474831202195af5646243f92cbb7019b0e997f248f7d2e9680909c9",
        "0x20a804f479e15d9bdecbfa32f65066d8d71c390382791fcdf726e9190027617",
        "0x1946919d894c240c092ac613978a51555cdaf797f81b9773232a666cd5c2df7",
        "0x5aed32c092b4d597e524160d749c4ac4bfe38960693b79f3c407e9fdf6ec7f4",
        "0x1fb8455c8cf0961e5133766510cd10f0270fa0b9b51d3e1ab51a3bcbbdce7f8",
        "0x77832660869c622a3b7eb88c4feef1e182ab67a3e64e65fba3e97f761593fe1",
        "0x7b02819413d724578ef9ac238c88fbcd687063a2bba4873983c7d6a3fdce14",
        "0x6403ccf0b2ecd94e3585c18390d6b61b0b41865de523a2682f6aa586b274ae5",
        "0x6e807fc5ca19a878ae464eb9f2d4e63d4bc27bcf6e6f5a1919b93e97b19ae3f",
        "0xadf4887105ce47d3670fca291ede6eccd55b73885e92edc3a13db4ef4bd84b",
        "0x469ae106636a21207ba4666453383629b063527efa2f2cb7f276192e8d885ff",
        "0x2e8f4fd003b2376d2bc7a6f9a38e8f46000db6e5f6520073c297e76fa696fdc",
        "0x168eac84f030b7a3af53883fda5e9f96b9ba9158b785caa2d72a8bf9e80c6b3",
        "0x5cd613d058d70ac8895d251dfb30822d470e8e626d33f2f2ea06f5e49ec345",
        "0x551533735edca74e90d4b055a4987c89fde8f65a497c02d621e306b0ab7567d",
        "0x2eb6b48fd35608b261e9f34a03be35c88bfb3c50f07f60e70fa51ea231097b7"
    ];

    const missing = original.filter((item) => !actual.includes(item));
    console.log("missing", missing);
    console.log("missing length", missing.length);

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

    const _balances = await Promise.all(missing.map(async (address) => {
        let retry = 0;
        while (retry < 3) {
            try {
                const balance = await contract.balanceOf(address, BigInt(1));
                return {
                    balance, address
                }
            } catch (e) {
                console.error(`Error fetching balance for ${address}, retrying...`);
                retry++;
                await new Promise((resolve) => setTimeout(resolve, 10000));
                if (retry === 3) {
                    throw e;
                }
            }
        }
        throw new Error("Failed to fetch balance");
    }));
    const balances = _balances.filter((item) => item.balance > 0);
    console.log(balances);

    const didAnyonepass = await OGFarmerNFTEligibleUsers(balances.map((item) => item.address));
    
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
  
// run();
// dnmm()
// getInvestmentFlowsGroupedByUser();
// depositsAndWithdraws();
OGFarmerNFTEligibleUsers();
// impact();