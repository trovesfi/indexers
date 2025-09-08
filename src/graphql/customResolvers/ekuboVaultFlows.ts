import { Resolver, Query, Arg, ObjectType, Field } from "type-graphql";
import { PrismaClient } from "@prisma/client";

import { standariseAddress } from "../utils";

const prisma = new PrismaClient();

@ObjectType()
export class EkuboVaultFlow {
  @Field(() => String)
  type!: string; // deposit | withdraw

  @Field(() => String)
  txHash!: string;

  @Field(() => Number)
  block_number!: number;

  @Field(() => Number)
  txIndex!: number;

  @Field(() => Number)
  eventIndex!: number;

  @Field(() => String)
  token0!: string;

  @Field(() => String)
  token1!: string;

  @Field(() => String)
  amount0!: string; // from position_updated.amount0

  @Field(() => String)
  amount1!: string; // from position_updated.amount1

  @Field(() => String)
  liquidity_delta!: string; // from position_updated.liquidity_delta

  @Field(() => Number)
  timestamp!: number;
}

@Resolver()
export class EkuboVaultFlowsResolver {
  @Query(() => [EkuboVaultFlow])
  async ekuboVaultFlows(
    @Arg("vault_contract", () => String) vault_contract: string,
    @Arg("user_address", () => String) user_address: string
  ): Promise<EkuboVaultFlow[]> {
    const contract = standariseAddress(vault_contract);
    const user = standariseAddress(user_address);

    // get deposit/withdraw events for this vault and user
    const flows = await prisma.investment_flows.findMany({
      where: {
        contract,
        receiver: user,
        type: { in: ["deposit", "withdraw"] },
      },
      orderBy: [
        { block_number: "asc" },
        { txIndex: "asc" },
        { eventIndex: "asc" },
      ],
    });

    if (!flows.length) return [];

    const results: EkuboVaultFlow[] = [];

    for (const f of flows) {
      const match = await prisma.position_updated.findFirst({
        where: {
          block_number: f.block_number,
          txHash: f.txHash,
          txIndex: f.txIndex,
          eventIndex: { lt: f.eventIndex },
        },
        orderBy: [{ eventIndex: "desc" }],
      });

      if (!match) {
        continue; // no prior position update in same tx
      }

      results.push({
        type: f.type,
        txHash: match.txHash,
        block_number: match.block_number,
        txIndex: match.txIndex,
        eventIndex: match.eventIndex,
        token0: match.token0,
        token1: match.token1,
        amount0: match.amount0,
        amount1: match.amount1,
        liquidity_delta: match.liquidity_delta,
        timestamp: match.timestamp,
      });
    }

    return results;
  }
}
