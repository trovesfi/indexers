import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

interface TVL {
  tvl: number;
}

const API_BASE_URL = "https://app.strkfarm.xyz/api/stats";

async function fetchTVL(url: string, retries = 3, delay = 1000): Promise<TVL | undefined> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const tvl: TVL = await response.json();
      return tvl;
    } catch (error) {
      console.error(`Failed to fetch TVL (Attempt ${attempt}):`, error);
      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  console.error("All attempts to fetch TVL failed.");
}

async function main() {
  const tvl = await fetchTVL(API_BASE_URL);
  let baseMultiplier = 1;

  if (!tvl) {
    console.log("Invalid TVL value:", tvl);
    return;
  }

  if (tvl.tvl < 1_000_000) {
    baseMultiplier = 1.5;
  } else if (tvl.tvl < 3_000_000) {
    baseMultiplier = 1.25;
  } else if (tvl.tvl < 5_000_000) {
    baseMultiplier = 1.1;
  }

  const users = await prisma.investment_flows.findMany({
    distinct: ["owner"],
    where: { type: "deposit" },
    select: { owner: true }
  });

  for (let user of users) {
    let netDeposit = 0;
    let accumulatedPoints = 0;
    let hold_days = 0;

    const transactions = await prisma.investment_flows.findMany({
      where: { owner: user.owner },
      orderBy: { timestamp: "asc" },
      select: { amount: true, asset: true, type: true, timestamp: true }
    });

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const amount =
        tx.asset === "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
          ? parseFloat(tx.amount) / 10 ** 6
          : parseFloat(tx.amount) / 10 ** 18;

      if (tx.type === "deposit") {
        hold_days = netDeposit < 10 ? 0 : hold_days + 1;

        const currentMultiplier = baseMultiplier + 0.5 * (hold_days / 365);
        accumulatedPoints += amount * currentMultiplier;

        netDeposit += amount;
      } else if (tx.type === "withdraw") {
        netDeposit -= amount;
      }
    }

    await prisma.user_points.upsert({
      where: { owner: user.owner },
      update: { points: accumulatedPoints, hold_days },
      create: { owner: user.owner, points: accumulatedPoints, hold_days }
    });

    console.log(`Accumulated points for ${user.owner}: ${accumulatedPoints}`);
  }

  console.log("One-time points calculation completed.");
}

main();
