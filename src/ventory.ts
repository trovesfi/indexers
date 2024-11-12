import { PrismaClient } from "@prisma/client";
import fs from 'fs';

async function main() {
    const prisma = new PrismaClient();

    const contracts = await prisma.investment_flows.findMany({
        distinct: ['contract'],
        select: {
            contract: true
        }
    })
    console.log(contracts);

    const maxBlock = await prisma.investment_flows.aggregate({
        _max: {
            block_number: true
        }
    });
    console.log(`Max block number: ${maxBlock._max.block_number}`);

    const txs = await prisma.investment_flows.findMany({
        orderBy: {
            timestamp: 'desc'
        },
        where: {
            contract: '0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250'
        }
    })
    console.log(txs.length);
    console.log(txs[0]);

    const allTxs = await prisma.investment_flows.findMany({
    })
    console.log('txsLen', allTxs.length);

    const txs1 = await prisma.harvests.findMany({
        where: {
            contract: '0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250'
        }
    })
    console.log(txs1.length);

    const allTxs1 = await prisma.harvests.findMany({
    })
    console.log('txsLen', allTxs1.length);

    let first50 = await prisma.investment_flows.findMany({
        take: 500,
        where: {
            type: 'deposit'
        }
    })
    const uniqueUsers: string[] = [];
    first50.forEach((tx) => {
        if (!uniqueUsers.includes(tx.owner) && uniqueUsers.length < 125) {
            uniqueUsers.push(tx.owner);
        }
    });
    console.log(`Unique users: ${uniqueUsers.length}`);
    // console.log(uniqueUsers);
    // fs.writeFileSync('./data/ventory/early_125.json', JSON.stringify(uniqueUsers, null, 2));

    const allUsers = await prisma.investment_flows.findMany({
        distinct: ['owner'],
        where: {
            type: 'deposit'
        },
        select: {
            owner: true
        }
    })
    console.log(`All users: ${allUsers.length}`);

    const luckyWinners: string[] = [];
    while (luckyWinners.length < 125) {
        // generate random index between 0 to allUsers.length
        const randomIndex = Math.floor(Math.random() * allUsers.length);
        const randomUser = allUsers[randomIndex].owner;
        if (!luckyWinners.includes(randomUser) && !uniqueUsers.includes(randomUser)) {
            luckyWinners.push(randomUser);
        }
    }
    console.log(`Lucky winners: ${luckyWinners.length}`);
    // console.log(luckyWinners);
    // fs.writeFileSync('./data/ventory/lucky_125.json', JSON.stringify(luckyWinners, null, 2));

    const allUsersAddresses = allUsers.map((user) => user.owner);
    // fs.writeFileSync('./data/ventory/all_users.json', JSON.stringify(allUsersAddresses, null, 2));

}

main()

// Max block number: 745800