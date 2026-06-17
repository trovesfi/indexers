// TEMP SCRIPT FOR COPYING PRICES FOR strkBTC and xstrkBTC from WBTC for a certain period of blocks
import { Prisma, PrismaClient } from "@prisma/client";

const START_BLOCK = 9650592;
const END_BLOCK = 10375242;
const SOURCE_SYMBOL = "WBTC";
const TARGET_SYMBOLS = ["xstrkBTC", "strkBTC"];

const prisma = new PrismaClient();

type TokenLookup = {
  address: string;
  symbol: string;
};

type PriceSummary = {
  count: bigint | number;
  min_block_number: number | null;
  max_block_number: number | null;
  min_timestamp: number | null;
  max_timestamp: number | null;
};

async function resolveAssetBySymbol(symbol: string): Promise<string> {
  const tokens: TokenLookup[] = await prisma.token_metadata.findMany({
    select: {
      address: true,
      symbol: true,
    },
  });

  const match = tokens.find(
    (token) => token.symbol.toLowerCase() === symbol.toLowerCase(),
  );

  if (!match) {
    const btcSymbols = tokens
      .map((token) => token.symbol)
      .filter((tokenSymbol) => tokenSymbol.toLowerCase().includes("btc"))
      .sort();

    throw new Error(
      `Could not find token_metadata entry for symbol "${symbol}". BTC-like symbols in DB: ${
        btcSymbols.join(", ") || "none"
      }`,
    );
  }

  return match.address;
}

async function resolveCopyConfig() {
  const sourceAsset = await resolveAssetBySymbol(SOURCE_SYMBOL);
  const targetAssets = await Promise.all(
    TARGET_SYMBOLS.map((symbol) => resolveAssetBySymbol(symbol)),
  );

  const uniqueTargetAssets = Array.from(new Set(targetAssets));
  if (uniqueTargetAssets.length !== targetAssets.length) {
    throw new Error("Target assets must be unique");
  }
  if (uniqueTargetAssets.includes(sourceAsset)) {
    throw new Error("Target assets cannot include the source WBTC asset");
  }

  return {
    startBlock: START_BLOCK,
    endBlock: END_BLOCK,
    sourceAsset,
    targetAssets: uniqueTargetAssets,
  };
}

async function getSourceSummary(
  sourceAsset: string,
  startBlock: number,
  endBlock: number,
): Promise<PriceSummary> {
  const [summary] = await prisma.$queryRaw<PriceSummary[]>`
    SELECT
      COUNT(*) AS count,
      MIN("block_number") AS min_block_number,
      MAX("block_number") AS max_block_number,
      MIN("timestamp") AS min_timestamp,
      MAX("timestamp") AS max_timestamp
    FROM "public"."prices"
    WHERE "asset" = ${sourceAsset}
      AND "block_number" >= ${startBlock}
      AND "block_number" <= ${endBlock}
  `;

  return summary;
}

async function copyPrices(
  sourceAsset: string,
  targetAssets: string[],
  startBlock: number,
  endBlock: number,
): Promise<number> {
  const targetRows = Prisma.join(
    targetAssets.map((targetAsset) => Prisma.sql`(${targetAsset})`),
  );

  return prisma.$executeRaw`
    INSERT INTO "public"."prices" (
      "asset",
      "price",
      "timestamp",
      "block_number",
      "_cursor"
    )
    SELECT
      targets."asset",
      source."price",
      source."timestamp",
      source."block_number",
      source."_cursor"
    FROM "public"."prices" AS source
    CROSS JOIN (VALUES ${targetRows}) AS targets("asset")
    WHERE source."asset" = ${sourceAsset}
      AND source."block_number" >= ${startBlock}
      AND source."block_number" <= ${endBlock}
    ON CONFLICT ("asset", "timestamp")
    DO UPDATE SET
      "price" = EXCLUDED."price",
      "block_number" = EXCLUDED."block_number",
      "_cursor" = EXCLUDED."_cursor"
  `;
}

async function main() {
  const { startBlock, endBlock, sourceAsset, targetAssets } =
    await resolveCopyConfig();

  console.log("=== Copy WBTC Prices ===");
  console.log(`Source asset: ${sourceAsset}`);
  console.log(`Target assets: ${targetAssets.join(", ")}`);
  console.log(`Block range: ${startBlock} -> ${endBlock}`);

  const summary = await getSourceSummary(sourceAsset, startBlock, endBlock);
  const sourceCount = Number(summary.count);

  console.log(
    `Found ${sourceCount} WBTC price rows from block ${
      summary.min_block_number ?? "n/a"
    } to ${summary.max_block_number ?? "n/a"}`,
  );

  if (sourceCount === 0) {
    throw new Error("No WBTC prices found for the configured block range");
  }

  const affectedRows = await copyPrices(
    sourceAsset,
    targetAssets,
    startBlock,
    endBlock,
  );

  console.log(
    `Copied WBTC prices to ${targetAssets.length} target assets. Affected rows: ${affectedRows}`,
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Failed to copy WBTC prices:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
