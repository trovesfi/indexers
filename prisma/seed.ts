import { PrismaClient, token_metadata } from "@prisma/client";
import { EkuboCLVaultStrategies } from "@strkfarm/sdk";
import { UniversalStrategies } from "@strkfarm/sdk";
import { VesuRebalanceStrategies } from "@strkfarm/sdk";
import { Global } from "@strkfarm/sdk";
import { Client } from "pg";
import { shortString } from "starknet";
import { num } from "starknet";
import { hash } from "starknet";

const overridePragmaBaseAsset = {
    tBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    LBTC: {
        baseAsset: 'BTC',
        priceDecimals: 8,
    },
    solvBTC: {
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
        ...EkuboCLVaultStrategies.map((strategy) => ({
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