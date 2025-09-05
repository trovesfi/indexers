import { Resolver, Query, Arg, ObjectType, Field, Float } from "type-graphql";
import { PrismaClient } from "@prisma/client";
import { Position_fees_collected } from "@generated/type-graphql";
import { standariseAddress } from "@/utils";

import { getSaltsForContract } from "../../../indexers/utils";

const prisma = new PrismaClient();

@ObjectType()
export class DailyFeeEarnings {
  @Field(() => String)
  date!: string;

  @Field(() => String)
  tokenAddress!: string;

  @Field(() => String)
  amount!: string;
}

@ObjectType()
export class FeeSummary {
  @Field(() => String)
  contract!: string;

  @Field(() => [DailyFeeEarnings])
  dailyEarnings!: DailyFeeEarnings[];

  @Field(() => Float)
  totalCollections!: number;
}

@Resolver(Position_fees_collected)
export class CustomPositionFeesResolver {
  /**
   * Returns day-wise fee earnings for a specific contract address
   */
  @Query(() => FeeSummary)
  async contractFeeEarnings(
    @Arg("contract", () => String) contract: string,
    @Arg("timeframe", () => String) timeframe: string
  ): Promise<FeeSummary> {
    const standardizedContract = standariseAddress(contract);
    const salts = getSaltsForContract(standardizedContract);

    if (salts.length === 0) {
      return {
        contract: standardizedContract,
        dailyEarnings: [],
        totalCollections: 0,
      };
    }

    let hoursAgo: number;
    switch (timeframe) {
      case "24h":
        hoursAgo = 24;
        break;
      case "30d":
        hoursAgo = 24 * 30;
        break;
      case "3m":
        hoursAgo = 24 * 90;
        break;
      default:
        hoursAgo = 24;
    }

    const startTimestamp = Math.floor(Date.now() / 1000) - hoursAgo * 60 * 60;

    const feeCollections = await prisma.position_fees_collected.findMany({
      where: {
        owner: standardizedContract,
        salt: { in: salts },
        timestamp: {
          gte: startTimestamp,
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    // grp by day and token
    const dailyEarningsMap = new Map<string, Map<string, bigint>>();
    let totalCollections = 0;

    for (const collection of feeCollections) {
      totalCollections++;

      const date = new Date(collection.timestamp * 1000)
        .toISOString()
        .split("T")[0];
      const amount0 = BigInt(collection.amount0);
      const amount1 = BigInt(collection.amount1);

      if (!dailyEarningsMap.has(date)) {
        dailyEarningsMap.set(date, new Map<string, bigint>());
      }

      const dayMap = dailyEarningsMap.get(date)!;

      if (amount0 > 0) {
        const current = dayMap.get(collection.token0) || BigInt(0);
        dayMap.set(collection.token0, current + amount0);
      }

      if (amount1 > 0) {
        const current = dayMap.get(collection.token1) || BigInt(0);
        dayMap.set(collection.token1, current + amount1);
      }
    }

    // convert to array format
    const dailyEarnings: DailyFeeEarnings[] = [];
    for (const [date, tokenMap] of dailyEarningsMap) {
      for (const [tokenAddress, amount] of tokenMap) {
        dailyEarnings.push({
          date,
          tokenAddress,
          amount: amount.toString(),
        });
      }
    }

    dailyEarnings.sort((a, b) => a.date.localeCompare(b.date));

    return {
      contract: standardizedContract,
      dailyEarnings,
      totalCollections,
    };
  }
}
