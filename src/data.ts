import { PrismaClient } from "@prisma/client";

async function run() {
    const prisma = new PrismaClient();

    const result = await prisma.subscriptions.findMany();
    console.log(result);
}

run();