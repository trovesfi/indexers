import 'reflect-metadata'; // Import the polyfill
import { ApolloServer } from '@apollo/server';
import { PrismaClient } from '@prisma/client';
import { 
  Investment_flows,
  Harvests,
  FindManyInvestment_flowsResolver,
  AggregateInvestment_flowsResolver,
  FindManyHarvestsResolver,
} from "@generated/type-graphql";
import { buildSchema, Resolver, Query, Arg } from 'type-graphql';
import { startStandaloneServer } from "@apollo/server/standalone";

import { CustomHarvestsResolver } from "./customResolvers/harvestResolvers.ts";
import { CustomInvestmentFlowsResolver } from './customResolvers/customInvestmentsResolver.ts';
import { CustomPositionFeesResolver } from './customResolvers/last_24hr_fee_earned.ts';

const prisma = new PrismaClient();

// Custom resolver to get total unique users
@Resolver(Investment_flows)
export class CountInvestment_flowsResolver {

  @Query((returns: any) => Number)
  async userCount(): Promise<Number> {
    const uniqueOwners = await prisma.investment_flows.findMany({
      distinct: ['owner'],
      select: {
          owner: true
      }
    });
    console.log("Unique owners: ", uniqueOwners.length);
    return uniqueOwners.length;
  }

}

async function main() {
  const schema = await buildSchema({
    resolvers: [
      AggregateInvestment_flowsResolver,
      FindManyInvestment_flowsResolver,
      CountInvestment_flowsResolver,
      FindManyHarvestsResolver,
      CustomHarvestsResolver,
      CustomInvestmentFlowsResolver,
      CustomPositionFeesResolver
    ],
    validate: false,
  });

  const server = new ApolloServer({
    schema,
    introspection: true,
  });

  const { url } = await startStandaloneServer(server, {
    context: async () => ({ prisma }),
    listen: { port: parseInt(process.env.PORT || '') || 4000 },
  });
  console.log(`Server is running, GraphQL Playground available at ${url}`);
}

if (require.main === module) {
  main().catch(console.error);
}