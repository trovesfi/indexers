import { Resolver, Query, Arg, ObjectType, Field } from "type-graphql";
import { PrismaClient } from "@prisma/client";
import { standariseAddress } from "@/utils";
import { EkuboCLVaultStrategies} from "@strkfarm/sdk";
// sdk is not ready to go live hence to run the indexer this vault has been hardcoded. Remember to remove it once sdk have required changes published.
import { HC_EkuboCLVaultV2Strategies as EkuboCLVaultV2Strategies } from "../../../indexers/utils/constants";
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

  @Field(() => String)
  quote_amount!: number; // from position_updated.quote_amount
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

    // Determine if vault is V1 or V2
    const isV1 = EkuboCLVaultStrategies.some((strat) => 
      strat.address.eqString(contract)
    );
    const isV2 = EkuboCLVaultV2Strategies.some((strat) => 
      strat.address.eqString(contract)
    );

    if (!isV1 && !isV2) {
      throw new Error(`Unknown vault contract: ${contract}`);
    }

    const results: EkuboVaultFlow[] = [];

    if (isV1) {
      // Query position_updated for V1 vaults
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
          quote_amount: f.quote_amount.toNumber() || 0,
        });
      }
    } else {
      // Query ekubo_v2_investment_flows for V2 vaults
      const flows = await prisma.ekubo_v2_investment_flows.findMany({
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

      for (const f of flows) {
        results.push({
          type: f.type, // Already set in the record
          tx_hash: f.tx_hash,
          block_number: f.block_number,
          tx_index: f.tx_index,
          event_index: f.event_index,
          token0: f.token0,
          token1: f.token1,
          amount0: f.amount0,
          amount1: f.amount1,
          liquidity_delta: "0", // Not tracked in V2
          timestamp: f.timestamp,
          quote_amount: f.quote_amount.toNumber() || 0,
        });
      }
    }

    return results;
  }
}