import { PrismaClient, token_metadata } from "@prisma/client";
import { EkuboCLVaultStrategies } from "@strkfarm/sdk";
import { UniversalStrategies } from "@strkfarm/sdk";
import { VesuRebalanceStrategies } from "@strkfarm/sdk";
import { Global } from "@strkfarm/sdk";
import { Client } from "pg";
import { shortString } from "starknet";
import { num } from "starknet";
import { hash } from "starknet";

// sdk is not ready to go live hence to run the indexer this vault has been hardcoded. Remember to remove it once sdk have required changes published.
import { HC_EkuboCLVaultV2Strategies as EkuboCLVaultV2Strategies } from "../indexers/utils/constants";

const overridePragmaBaseAsset = {
    tBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    LBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    xLBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    xtBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    xWBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    xsBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    solvBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    strkBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    xstrkBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    USDT: {
        baseAsset: 'USDT',
        priceDecimals: 6,
    },
    USDC: {
        baseAsset: 'USDC',
        priceDecimals: 6,
    },
}

function getPragmaPairId(tokenSymbol: string) {
    const _symbol = overridePragmaBaseAsset[tokenSymbol as keyof typeof overridePragmaBaseAsset]?.baseAsset || tokenSymbol;
    return shortString.encodeShortString(`${_symbol.toUpperCase()}/USD`)
}

function getPragmaDecimals(tokenSymbol: string) {
    return overridePragmaBaseAsset[tokenSymbol as keyof typeof overridePragmaBaseAsset]?.priceDecimals || 8;
}

const tokenInfo: Omit<token_metadata, 'id'>[] = [
    ...Global.getDefaultTokens().map((token) => ({
        address: token.address.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
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
        ...UniversalStrategies.map((strategy) => ({
            strategy_address: strategy.address.address,
            strategy_name: strategy.name,
            quote_asset: strategy.depositTokens[0].address.address,
        })),
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
