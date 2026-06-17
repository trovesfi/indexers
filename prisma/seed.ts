import { PrismaClient, token_metadata } from "@prisma/client";
import { EkuboCLVaultStrategies } from "@strkfarm/sdk";
import { VesuRebalanceStrategies } from "@strkfarm/sdk";
import { Global, TokenIndexingType } from "@strkfarm/sdk";

// sdk is not ready to go live hence to run the indexer this vault has been hardcoded. Remember to remove it once sdk have required changes published.
import {
    HC_EkuboCLVaultV2Strategies as EkuboCLVaultV2Strategies,
    PRAGMA_PAIRS,
} from "../indexers/utils/constants";

const pragmaPairIdByTokenSymbol = new Map(
    PRAGMA_PAIRS.map((pair) => [pair.tokenSymbol.toLowerCase(), pair.pairId])
);

const defaultTokens = Global.getDefaultTokens();
const tokenAddressBySymbol = new Map(
    defaultTokens.map((token) => [token.symbol.toLowerCase(), token.address.address])
);

function getPragmaPairId(tokenSymbol: string) {
    const pairId = pragmaPairIdByTokenSymbol.get(tokenSymbol.toLowerCase());
    return pairId ?? null;
}

function getPragmaDecimals(tokenSymbol: string) {
    if (['USDC', 'USDT'].includes(tokenSymbol.toUpperCase())) return 6;
    return 8;
}

function getPeggedAsset(token: (typeof defaultTokens)[number]) {
    if (token.indexingType !== TokenIndexingType.PEGGED || !token.priceProxySymbol) {
        return null;
    }
    return tokenAddressBySymbol.get(token.priceProxySymbol.toLowerCase()) ?? null;
}

// For now deprecated tokens wont have any prices and that is fine as well
const tokenInfo: Omit<token_metadata, 'id'>[] = [
    ...defaultTokens
    .filter((token) => token.indexingType !== TokenIndexingType.IGNORE)
    .map((token) => ({
        address: token.address.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        pegged_asset: getPeggedAsset(token),
        pragma_pair_id: getPragmaPairId(token.symbol),
        pragma_decimals: getPragmaDecimals(token.symbol),
    }))
]
// As we started tracking LST and some BTC prices from cron, we added them to the token info
// .filter((token) => !['solvBTC', 'LBTC', 'xLBTC', 'xtBTC', 'xWBTC', 'xsBTC', 'tBTC'].includes(token.symbol))

async function seedStrategyMetadata() {
  const prisma = new PrismaClient();
  await prisma.strategy_metadata.deleteMany();
  await prisma.strategy_metadata.createMany({
    data: [
        ...EkuboCLVaultStrategies
        .map((strategy) => ({
            strategy_address: strategy.address.address,
            strategy_name: strategy.name,
            quote_asset: strategy.additionalInfo.quoteAsset.address.address,
        })),
        ...EkuboCLVaultV2Strategies
        .map((strategy) => ({
            strategy_address: strategy.address.address,
            strategy_name: strategy.name,
            quote_asset: strategy.additionalInfo.quoteAsset.address.address,
        })),
        ...VesuRebalanceStrategies.map((strategy) => ({
            strategy_address: strategy.address.address,
            strategy_name: strategy.name,
            quote_asset: strategy.depositTokens[0].address.address,
        }))
    ]
  });
}

async function seed() {
  const prisma = new PrismaClient();

  // Required by DB Triggers
  await prisma.token_metadata.deleteMany();
  console.log(`Seeding ${tokenInfo.length} token metadata`);
  await prisma.token_metadata.createMany({
    data: tokenInfo
  });
  await seedStrategyMetadata();
}

if (require.main === module) {
    seed();
    // seedStrategyMetadata();
}
