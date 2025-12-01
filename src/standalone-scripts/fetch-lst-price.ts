import * as dotenv from "dotenv";
dotenv.config();

import { Contract, RpcProvider, BlockIdentifier, num } from "starknet";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../prisma/drizzle/schema.js";
import * as fs from "fs";
import * as path from "path";
import EkuboPricerAbi from "../data/ekubo-price-fethcer.abi.json";

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

interface ProgressData {
  lastProcessedBlock: number;
}

const LST_TOKENS: TokenInfo[] = [
  {
    symbol: "xsBTC",
    address:
      "0x0580f3dc564a7b82f21d40d404b3842d490ae7205e6ac07b1b7af2b4a5183dc9",
    decimals: 18,
  },
  {
    symbol: "solvBTC",
    address:
      "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68",
    decimals: 18,
  },
  {
    symbol: "xLBTC",
    address:
      "0x07dd3c80de9fcc5545f0cb83678826819c79619ed7992cc06ff81fc67cd2efe0",
    decimals: 8,
  },
  {
    symbol: "LBTC",
    address:
      "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4",
    decimals: 8,
  },
  {
    symbol: "xtBTC",
    address:
      "0x043a35c1425a0125ef8c171f1a75c6f31ef8648edcc8324b55ce1917db3f9b91",
    decimals: 18,
  },
  {
    symbol: "tBTC",
    address:
      "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f",
    decimals: 18,
  },
  {
    symbol: "xWBTC",
    address:
      "0x06a567e68c805323525fe1649adb80b03cddf92c23d2629a6779f54192dffc13",
    decimals: 8,
  },
  {
    symbol: "xSTRK",
    address:
      "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
    decimals: 18,
  },
];

const EKUBO_PRICER_ADDRESS =
  "0x04946fb4ad5237d97bbb1256eba2080c4fe1de156da6a7f83e3b4823bb6d7da1";
const USDC_ADDRESS =
  "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";
const USDC_DECIMALS = 6;
const BATCH_SIZE = 1000;
const PROGRESS_FILE = path.join(
  __dirname,
  "../../backup/lst-price-sync-progress.json",
);

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

function readProgress(): number | null {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) {
      return null;
    }
    const data = fs.readFileSync(PROGRESS_FILE, "utf-8");
    const progress: ProgressData = JSON.parse(data);
    return progress.lastProcessedBlock;
  } catch (error) {
    console.warn("Failed to read progress file, starting fresh:", error);
    return null;
  }
}

function writeProgress(blockNumber: number): void {
  try {
    const dir = path.dirname(PROGRESS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const progress: ProgressData = { lastProcessedBlock: blockNumber };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error("Failed to write progress file:", error);
  }
}

class EkuboPricer {
  private contract: Contract;
  private provider: RpcProvider;

  constructor(provider: RpcProvider) {
    this.provider = provider;
    this.contract = new Contract({
      abi: EkuboPricerAbi,
      address: EKUBO_PRICER_ADDRESS,
      providerOrAccount: provider,
    });
  }

  private div2Power128(num: bigint): number {
    return Number((num * BigInt(1e18)) / BigInt(2 ** 128)) / 1e18;
  }

  async getPrice(
    tokenAddress: string,
    tokenDecimals: number,
    blockIdentifier: BlockIdentifier,
  ): Promise<number | null> {
    const result: any = await this.contract.call(
      "get_prices",
      [USDC_ADDRESS, [tokenAddress], 3600, 1000000],
      { blockIdentifier },
    );

    if (!result || result.length === 0) {
      throw new Error(`No price result returned for ${tokenAddress}`);
    }

    const priceResult = result[0];

    if (!priceResult?.variant?.Price) {
      const variant = priceResult?.variant
        ? Object.keys(priceResult.variant)[0]
        : "Unknown";

      // NotInitialized, InsufficientLiquidity, and PeriodTooLong are expected
      // when price data doesn't exist for that block - return null instead of throwing
      if (
        variant === "NotInitialized" ||
        variant === "InsufficientLiquidity" ||
        variant === "PeriodTooLong"
      ) {
        return null;
      }

      // For other unknown variants, throw an error
      throw new Error(
        `Price fetch failed with variant: ${variant} for ${tokenAddress}`,
      );
    }

    const rawPrice =
      typeof priceResult.variant.Price === "string"
        ? BigInt(priceResult.variant.Price)
        : priceResult.variant.Price;

    const priceAfterX128 = this.div2Power128(rawPrice);

    const decimalAdjustment = 10 ** (tokenDecimals - USDC_DECIMALS);
    const price = priceAfterX128 * decimalAdjustment;

    return price;
  }

  async getBlockTimestamp(blockNumber: number): Promise<number> {
    const block = await this.provider.getBlock(blockNumber);
    return block.timestamp;
  }
}

function getDB(connectionString: string) {
  const pool = new pg.Pool({
    connectionString: connectionString,
    ssl:
      process.env.IS_TLS === "false"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  return drizzle(pool, { schema });
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
  db: ReturnType<typeof getDB>,
  startBlock: number,
  endBlock: number,
): Promise<void> {
  console.log(`\nProcessing batch: blocks ${startBlock} to ${endBlock}`);

  const priceRecords: PriceRecord[] = [];
  let totalAttempts = 0;
  let totalFound = 0;
  let totalSkipped = 0;

  // Process each block in the batch
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    // Fetch block timestamp
    const timestamp = await retryWithBackoff(
      () => pricer.getBlockTimestamp(blockNumber),
      `Fetch timestamp for block ${blockNumber}`,
      5,
    );

    // Fetch prices for all tokens in parallel
    const pricePromises = LST_TOKENS.map(async (token) => {
      totalAttempts++;
      try {
        const price = await retryWithBackoff(
          () => pricer.getPrice(token.address, token.decimals, blockNumber),
          `Fetch price for ${token.symbol} at block ${blockNumber}`,
          3, // Less retries per token to speed up
        );

        // If price is null, it means data doesn't exist for this block (NotInitialized, etc.)
        if (price === null) {
          totalSkipped++;
          return null;
        }

        totalFound++;
        return {
          asset: standardiseAddress(token.address),
          price: price,
          timestamp: timestamp,
          block_number: blockNumber,
        };
      } catch (error: any) {
        totalSkipped++;
        // Only log actual errors, not expected "NotInitialized" cases
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

    // Log progress every 100 blocks
    if (blockNumber % 100 === 0 || blockNumber === endBlock) {
      console.log(
        `  Processed ${blockNumber - startBlock + 1}/${endBlock - startBlock + 1} blocks | Found: ${totalFound} | Skipped: ${totalSkipped}`,
      );
    }
  }

  // Insert all prices for this batch
  if (priceRecords.length > 0) {
    await insertPrices(db, priceRecords);
  }

  // Update progress
  writeProgress(endBlock);
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

  // Initialize provider and pricer
  console.log("Initializing RPC provider...");
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const pricer = new EkuboPricer(provider);

  // Initialize database
  console.log("Connecting to database...");
  const db = getDB(connectionString);

  // Determine starting block
  const lastProcessedBlock = readProgress();
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
      await processBatch(pricer, db, batchStartBlock, batchEndBlock);
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

export { main, EkuboPricer, LST_TOKENS };
