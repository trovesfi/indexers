import { Resolver, Query, Arg, ObjectType, Field } from "type-graphql";
import { PrismaClient } from "@prisma/client";
import { standariseAddress } from "@/utils";

const prisma = new PrismaClient();

@ObjectType()
export class EkuboVaultFlow {
  @Field(() => String)
  type!: string; // deposit | withdraw

  @Field(() => String)
  tx_hash!: string;

  @Field(() => Number)
  block_number!: number;

  @Field(() => Number)
  tx_index!: number;

  @Field(() => Number)
  event_index!: number;

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
    const flows = await prisma.position_updated.findMany({
      where: {
        vault_address: contract,
        user_address: user,
      },
      orderBy: [
        { block_number: "desc" },
        { tx_index: "asc" },
        { event_index: "asc" },
      ],
    });

    if (!flows.length) return [];

    const results: EkuboVaultFlow[] = [];

    for (const f of flows) {
      results.push({
        type: BigInt(f.amount0) > 0n ? "deposit" : "withdraw",
        tx_hash: f.tx_hash,
        block_number: f.block_number,
        tx_index: f.tx_index,
        event_index: f.event_index,
        token0: f.token0,
        token1: f.token1,
        amount0: f.amount0,
        amount1: f.amount1,
        liquidity_delta: f.liquidity_delta,
        timestamp: f.timestamp,
      });
    }

    return results;
  }
}