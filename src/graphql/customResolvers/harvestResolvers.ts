import { 
    Harvests,
  } from "@generated/type-graphql";
import { Resolver, Query, Arg, ObjectType, Field, Float, Int } from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import yahooFinance from 'yahoo-finance2';
import { getClosePriceAtTimestamp } from "../utils.ts";
const prisma = new PrismaClient();

export type HarvestSummaryType = {
    rawSTRKAmount: string;
    STRKAmount: number;
    USDValue: number;
}

@ObjectType()
export class HarvestSummary {
  @Field(() => String)
  rawSTRKAmount!: string;

  @Field(() => Float)
  STRKAmount!: number;

  @Field(() => Float)
  USDValue!: number;
}

async function getHarvestsSummary(harvests: any[]) {
    const isAtleastOnePriceMissing = harvests.some(harvest => !harvest.price);
    let prices: any[] = [];
    if (isAtleastOnePriceMissing) {
        console.log(`Fetching prices from yahoo finance for ${harvests.length} harvests`);
        const results = await yahooFinance.chart('STRK22691-USD', {
            period1: '2024-02-01'
        });
        prices = results.quotes;
    }
  
      const harvestsWithPrices = harvests.map(harvest => {
          const adjustedAmount = Number(BigInt(harvest.amount) * BigInt(100) / BigInt(10 ** 18)) / 100;
          if (harvest.price) {
              return {
                  amount: adjustedAmount,
                  usdValue: adjustedAmount * harvest.price,
                  price: harvest.price,
                  timestamp: harvest.timestamp
              }
          } else {
              const price = getClosePriceAtTimestamp(prices, harvest.timestamp);
              if (!price) {
                    console.error("Price not found for harvest: ", harvest);
                    return {
                        amount: adjustedAmount,
                        usdValue: 0,
                        price: 0,
                        timestamp: harvest.timestamp
                    }
              }
            
              // save this price for future
              prisma.harvests.update({
                where: {
                    event_id: {
                        block_number: harvest.block_number,
                        txIndex: harvest.txIndex,
                        eventIndex: harvest.eventIndex
                    }
                },
                data: {
                  price: price
                }
              }).catch((err: any) => {
                console.error("Error saving price: ", err, harvest);
              });
              return {
                  amount: adjustedAmount,
                  usdValue: price ? adjustedAmount * price : 0,
                  price: price,
                  timestamp: harvest.timestamp
              }
          }
      });
  
      const totalUsdValue = harvestsWithPrices.reduce((acc, curr) => {
          return acc + curr.usdValue;
      }, 0);
      const totalAdjustedSTRKValue = harvestsWithPrices.reduce((acc, curr) => {
          return acc + curr.amount;
      }, 0);
      console.log("totalUsdValue: ", totalUsdValue);
      console.log("totalAdjustedSTRKValue: ", totalAdjustedSTRKValue);
  
      const total = harvests.reduce((acc, curr) => {
        return acc + BigInt(curr.amount);
      }, BigInt(0));
  
      console.log("Total STRK Harvested: ", total);
      return {
          rawSTRKAmount: total.toString(),
          STRKAmount: totalAdjustedSTRKValue,
          USDValue: totalUsdValue
      };
}

@Resolver(Harvests)
export class CustomHarvestsResolver {
  // Custom resolver to get total harvests for a given contract
  @Query(() => Int)
  async totalHarvestsByContract(
    @Arg("contract", () => String) contract: string,
  ): Promise<number> {
    const total = await prisma.harvests.aggregate({
      where: { contract },
      _count: true,
    });
    console.log("Total harvests: ", total._count);
    return total._count;
  }

  // Total STRK Harvested by contract
  @Query(() => HarvestSummary)
  async totalStrkHarvestedByContract(
    @Arg("contract", () => String) contract: string,
  ): Promise<HarvestSummary> {
    const harvests = await prisma.harvests.findMany({
      where: { contract },
    });

    const result = await getHarvestsSummary(harvests);
    return Object.assign(new HarvestSummary(), result);
  }

  // Returns total harvests across all strategies/contracts
  @Query(() => Int)
  async totalHarvests(): Promise<number> {
    const total = await prisma.harvests.aggregate({
      _count: true,
    });
    console.log("Total harvests: ", total._count);
    return total._count;
  }

  // Total STRK Harvested across all contracts
  @Query(() => HarvestSummary)
  async totalStrkHarvested(): Promise<HarvestSummary> {
    const harvests = await prisma.harvests.findMany();

    const result = await getHarvestsSummary(harvests);
    return Object.assign(new HarvestSummary(), result);
  }
}