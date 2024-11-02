import { PrismaClient, type PrismaPromise } from "@prisma/client";
import cron from "node-cron";

const prisma = new PrismaClient();

interface TVL {
  tvl: number;
}

interface UserStats {
  holdingsUSD: number;
  strategyWise: {
    id: string;
    usdValue: number;
    tokenInfo: {
      name: string;
      symbol: string;
      logo: string;
      decimals: number;
      displayDecimals: number;
    };
    amount: string;
  }[];
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

async function fetchUserStats(address: string, retries = 3, delay = 1000): Promise<UserStats | undefined> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/${address}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const stats: UserStats = await response.json();
      return stats;
    } catch (error) {
      console.error(`Failed to fetch stats for user ${address} (Attempt ${attempt}):`, error);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

async function updateUserPoints(user: { owner: string }, baseMultiplier: number) {
  try {
    const stats = await fetchUserStats(user.owner);
    if (!stats) {
      console.log(`Unable to fetch stats for user: ${user.owner}`);
      return;
    }

    let userRecord = await prisma.user_points.upsert({
      where: { owner: user.owner },
      update: {},
      create: { owner: user.owner, points: 0 }
    });

    const holdDaysRecord = await prisma.user_points.findFirst({
      where: { owner: user.owner },
      select: { id: true, hold_days: true }
    });

    const currentHoldDays = holdDaysRecord?.hold_days ?? 0;
    const newHoldDays = stats.holdingsUSD >= 10 ? currentHoldDays + 1 : 0;

    await prisma.user_points.update({
      where: { id: holdDaysRecord?.id },
      data: { hold_days: newHoldDays }
    });

    const currentMultiplier = baseMultiplier + 0.5 * (newHoldDays / 365);
    const dailyUserPoints = stats.holdingsUSD * currentMultiplier;

    const updatedPoints = (userRecord.points ?? 0) + dailyUserPoints;

    await prisma.user_points.update({
      where: { id: userRecord.id },
      data: { points: updatedPoints }
    });
  } catch (error) {
    console.error("Error updating user points:", error);
  }
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
    select: { owner: true, timestamp: true }
  });

  if (!users.length) {
    console.log("No users found");
    return;
  }

  for (let user of users) {
    await updateUserPoints(user, baseMultiplier);
  }

  console.log("Daily points allocation completed.");
}

main();

// cron.schedule("0 1 * * *", main);
