import { PrismaClient } from "@prisma/client";

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
        where: {
            contract: '0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250'
        }
    })
    console.log(txs.length);

    const allTxs = await prisma.investment_flows.findMany({
    })
    console.log(allTxs.length);

    const txs1 = await prisma.harvests.findMany({
        where: {
            contract: '0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250'
        }
    })
    console.log(txs1.length);
    console.log(txs1);

    const allTxs1 = await prisma.harvests.findMany({
    })
    console.log(allTxs1.length);
}

main()

// Max block number: 745800