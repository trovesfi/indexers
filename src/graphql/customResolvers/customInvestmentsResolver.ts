import { Resolver, Query, Arg } from "type-graphql";
import { PrismaClient } from "@prisma/client";
import { Investment_flows } from "@generated/type-graphql"; // generated Prisma model

const prisma = new PrismaClient();

@Resolver(of => Investment_flows)
export class CustomInvestmentFlowsResolver {
  /**
   * Returns all 'redeem' requests that do NOT have a matching 'claim'
   */
  @Query(() => [Investment_flows])
  async unclaimedRedeems(
    @Arg("contract", () => String) contract: string,
  ): Promise<Investment_flows[]> {
    // Step 1: fetch all redeems
    const redeemsWithoutClaims = await prisma.$queryRaw<Investment_flows[]>`
      SELECT *
      FROM investment_flows r
      WHERE r.type = 'redeem'
      AND r.contract = ${contract}
      AND NOT EXISTS (
        SELECT 1
        FROM investment_flows c
        WHERE c.type = 'claim'
          AND c.request_id = r.request_id
          AND c.contract = ${contract}
      )
    `;

    // Step 3: filter redeems without claim
    return redeemsWithoutClaims;
  }
}
