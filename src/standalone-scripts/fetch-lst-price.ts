import * as dotenv from "dotenv";
dotenv.config();

import { RpcProvider, num } from "starknet";
import * as schema from "../../prisma/drizzle/schema.js";
import { eq } from "drizzle-orm";
import { Global, EkuboPricer, getMainnetConfig, PriceInfo } from "@strkfarm/sdk";
import { getDB } from "../../indexers/utils/index.js";

interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

interface PriceRecord {
  asset: string;
  price: number;
  timestamp: number;
  block_number: number;
}

// LST token symbols to filter from SDK's default tokens
const LST_TOKEN_SYMBOLS = [
  "xsBTC",
  "solvBTC",
  "xLBTC",
  "LBTC",
  "xtBTC",
  "tBTC",
  "xWBTC",
];

// Get LST tokens from SDK's Global.getDefaultTokens()
function getLSTTokens(): TokenInfo[] {
  const allTokens = Global.getDefaultTokens();
  return allTokens
    .filter((token) => LST_TOKEN_SYMBOLS.includes(token.symbol))
    .map((token) => ({
      symbol: token.symbol,
      address: token.address.address, // Convert ContractAddr to string
      decimals: token.decimals,
    }));
}

const LST_TOKENS = getLSTTokens();

const BATCH_SIZE = 1000;
const BLOCKS_PER_INTERVAL = 200; // Process every ~200 blocks (10 minutes)
const PROGRESS_ID = "lst_price_sync";

function standardiseAddress(address: string | bigint): string {
  let _a = address;
  if (!address) {
    _a = "0";
  }
  const a = num.getHexString(num.getDecimalString(_a.toString()));
  return a;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries: number = 5,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      console.error(
        `${operation} failed (attempt ${attempt}/${maxRetries}): ${error.message}`,
      );

      if (isLastAttempt) {
        throw new Error(
          `${operation} failed after ${maxRetries} attempts: ${error.message}`,
        );
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      console.log(`Retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${operation} failed unexpectedly`);
}

async function readProgress(
  db: ReturnType<typeof getDB>,
): Promise<number | null> {
  try {
    const result = await db
      .select()
      .from(schema.lst_price_sync_progress)
      .where(eq(schema.lst_price_sync_progress.id, PROGRESS_ID))
      .limit(1);

    if (result.length === 0 || result[0].last_processed_block === null) {
      return null;
    }
    return result[0].last_processed_block;
  } catch (error) {
    console.warn("Failed to read progress from database, starting fresh:", error);
    return null;
  }
}

async function writeProgress(
  db: ReturnType<typeof getDB>,
  blockNumber: number,
): Promise<void> {
  try {
    await db
      .insert(schema.lst_price_sync_progress)
      .values({
        id: PROGRESS_ID,
        last_processed_block: blockNumber,
      })
      .onConflictDoUpdate({
        target: schema.lst_price_sync_progress.id,
        set: { last_processed_block: blockNumber },
      });
  } catch (error) {
    console.error("Failed to write progress to database:", error);
    throw error;
  }
}

// Helper function to get block timestamp
async function getBlockTimestamp(
  provider: RpcProvider,
  blockNumber: number,
): Promise<number> {
  const block = await provider.getBlock(blockNumber);
  return block.timestamp;
}

async function insertPrices(
  db: ReturnType<typeof getDB>,
  prices: PriceRecord[],
): Promise<void> {
  if (prices.length === 0) return;

  await retryWithBackoff(
    async () => {
      await db.insert(schema.prices).values(prices).onConflictDoNothing();
    },
    `Insert ${prices.length} price records`,
    5,
  );

  console.log(`Inserted ${prices.length} price records`);
}

async function processBatch(
  pricer: EkuboPricer,
  provider: RpcProvider,
  db: ReturnType<typeof getDB>,
  startBlock: number,
  endBlock: number,
): Promise<void> {
  console.log(`\nProcessing batch: blocks ${startBlock} to ${endBlock}`);

  const priceRecords: PriceRecord[] = [];
  let totalAttempts = 0;
  let totalFound = 0;
  let totalSkipped = 0;

  // Process blocks at intervals of ~200 blocks (10 minutes)
  for (
    let blockNumber = startBlock;
    blockNumber <= endBlock;
    blockNumber += BLOCKS_PER_INTERVAL
  ) {
    // Fetch block timestamp
    const timestamp = await retryWithBackoff(
      () => getBlockTimestamp(provider, blockNumber),
      `Fetch timestamp for block ${blockNumber}`,
      5,
    );

    // Fetch prices for all tokens in parallel
    const pricePromises = LST_TOKENS.map(async (token) => {
      totalAttempts++;
      try {
        const priceInfo: PriceInfo = await retryWithBackoff(
          () => pricer.getPrice(token.address, blockNumber),
          `Fetch price for ${token.symbol} at block ${blockNumber}`,
          3, // Less retries per token to speed up
        );

        totalFound++;
        return {
          asset: standardiseAddress(token.address),
          price: priceInfo.price,
          timestamp: timestamp,
          block_number: blockNumber,
        };
      } catch (error: any) {
        totalSkipped++;
        if (
          !error.message?.includes("NotInitialized") &&
          !error.message?.includes("InsufficientLiquidity") &&
          !error.message?.includes("PeriodTooLong")
        ) {
          console.warn(
            `Failed to fetch price for ${token.symbol} at block ${blockNumber}: ${error.message}`,
          );
        }
        return null;
      }
    });

    const results = await Promise.all(pricePromises);
    const validPrices = results.filter((p): p is PriceRecord => p !== null);
    priceRecords.push(...validPrices);

    // Log progress every interval
    const processedCount = Math.floor((blockNumber - startBlock) / BLOCKS_PER_INTERVAL) + 1;
    const totalIntervals = Math.ceil((endBlock - startBlock + 1) / BLOCKS_PER_INTERVAL);
    if (blockNumber % (BLOCKS_PER_INTERVAL * 5) === 0 || blockNumber >= endBlock) {
      console.log(
        `  Processed ${processedCount}/${totalIntervals} intervals (block ${blockNumber}) | Found: ${totalFound} | Skipped: ${totalSkipped}`,
      );
    }
  }

  // Insert all prices for this batch
  if (priceRecords.length > 0) {
    await insertPrices(db, priceRecords);
  }

  // Update progress
  await writeProgress(db, endBlock);
  console.log(
    `✓ Batch complete. Progress saved at block ${endBlock} | Total: ${totalFound} prices found, ${totalSkipped} skipped (no data available)`,
  );
}

// ============= Main Execution =============

async function main() {
  console.log("=== LST Price Fetcher ===\n");

  const rpcUrl = process.env.RPC_URL;
  const connectionString = process.env.POSTGRES_CONNECTION_STRING;
  const startingBlockEnv = process.env.STARTING_BLOCK_LST;
  const numBatchesEnv = process.env.NUM_BATCHES;

  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required");
  }
  if (!connectionString) {
    throw new Error(
      "POSTGRES_CONNECTION_STRING environment variable is required",
    );
  }
  if (!startingBlockEnv) {
    throw new Error("STARTING_BLOCK_LST environment variable is required");
  }

  const startingBlockLst = parseInt(startingBlockEnv, 10);
  const numBatches = numBatchesEnv ? parseInt(numBatchesEnv, 10) : undefined;

  // Initialize SDK config and pricer
  console.log("Initializing RPC provider...");
  const config = getMainnetConfig(rpcUrl);
  const provider = config.provider;
  const allTokens = Global.getDefaultTokens();
  const pricer = new EkuboPricer(config, allTokens);

  // Initialize database
  console.log("Connecting to database...");
  const db = getDB(connectionString);

  // Determine starting block
  const lastProcessedBlock = await readProgress(db);
  const startBlock = lastProcessedBlock
    ? lastProcessedBlock + 1
    : startingBlockLst;

  console.log(`Starting block: ${startBlock}`);
  if (lastProcessedBlock) {
    console.log(`Resuming from last processed block: ${lastProcessedBlock}`);
  }

  // Get current block number
  console.log("Fetching current block number...");
  const currentBlockResponse = await retryWithBackoff(
    () => provider.getBlock("latest"),
    "Fetch current block",
    5,
  );
  const currentBlock = currentBlockResponse.block_number;
  console.log(`Current block: ${currentBlock}\n`);

  // Calculate batches
  const totalBlocks = currentBlock - startBlock + 1;
  if (totalBlocks <= 0) {
    console.log("No new blocks to process. Already up to date!");
    process.exit(0);
  }

  const totalBatchesNeeded = Math.ceil(totalBlocks / BATCH_SIZE);
  const batchesToProcess = numBatches
    ? Math.min(numBatches, totalBatchesNeeded)
    : totalBatchesNeeded;

  console.log(`Total blocks to process: ${totalBlocks}`);
  console.log(`Total batches needed: ${totalBatchesNeeded}`);
  console.log(`Batches to process: ${batchesToProcess}\n`);

  // Process batches
  for (let i = 0; i < batchesToProcess; i++) {
    const batchStartBlock = startBlock + i * BATCH_SIZE;
    const batchEndBlock = Math.min(
      batchStartBlock + BATCH_SIZE - 1,
      currentBlock,
    );

    console.log(`\n[Batch ${i + 1}/${batchesToProcess}]`);

    try {
      await processBatch(pricer, provider, db, batchStartBlock, batchEndBlock);
    } catch (error: any) {
      console.error(`Batch processing failed: ${error.message}`);
      console.error("Stopping execution. Progress has been saved.");
      process.exit(1);
    }
  }

  console.log("\n=== Processing Complete ===");
  console.log(`Processed ${batchesToProcess} batches`);
  console.log(`Final block: ${startBlock + batchesToProcess * BATCH_SIZE - 1}`);

  if (batchesToProcess < totalBatchesNeeded) {
    console.log(
      `\nRemaining batches: ${totalBatchesNeeded - batchesToProcess}`,
    );
    console.log("Run the script again to continue processing.");
  } else {
    console.log("\n✓ All historical prices have been fetched and stored!");
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main, LST_TOKENS };
