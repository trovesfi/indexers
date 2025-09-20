import { PrismaClient, token_metadata } from "@prisma/client";
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
    return shortString.encodeShortString(`${_symbol}/USD`)
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

async function seed() {
  const prisma = new PrismaClient();

  console.log(`Seeding ${tokenInfo.length} token metadata`);
  await prisma.token_metadata.createMany({
    data: tokenInfo
  });
}

if (require.main === module) {
    seed();
}