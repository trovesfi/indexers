import { Resolver, Query, Arg, ObjectType, Field, Float } from "type-graphql";
import { PrismaClient } from "@prisma/client";
import { Position_fees_collected } from "@generated/type-graphql";
import { standariseAddress } from "@/utils";

const prisma = new PrismaClient();

function toBigIntSafe(value: any): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") {
    if (/e/i.test(value)) {
      const num = Number(value);
      if (Number.isFinite(num)) return BigInt(Math.trunc(num));
      throw new Error(`Invalid numeric string: ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number");
    return BigInt(Math.trunc(value));
  }
  throw new Error(`Unsupported type for BigInt conversion: ${typeof value}`);
}

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
        vault_address: standardizedContract,
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
      const amount0Raw = toBigIntSafe(collection.amount0);
      const amount1Raw = toBigIntSafe(collection.amount1);
      const amount0 = amount0Raw >= 0n ? amount0Raw : -amount0Raw;
      const amount1 = amount1Raw >= 0n ? amount1Raw : -amount1Raw;

      if (!dailyEarningsMap.has(date)) {
        dailyEarningsMap.set(date, new Map<string, bigint>());
      }

      const dayMap = dailyEarningsMap.get(date)!;

      if (amount0 > 0n) {
        const current = dayMap.get(collection.token0) || 0n;
        dayMap.set(collection.token0, current + amount0);
      }

      if (amount1 > 0n) {
        const current = dayMap.get(collection.token1) || 0n;
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