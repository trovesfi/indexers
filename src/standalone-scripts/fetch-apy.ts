import "dotenv/config";

import {
  EkuboCLVault,
  UniversalStrategy,
  UniversalLstMultiplierStrategy,
  VesuRebalance,
  SenseiVault,
  StrategyType,
  buildStrategyRegistry,
  getMainnetConfig,
  Global,
  PricerFromApi,
  IStrategyMetadata,
  detectCapabilities,
} from "@strkfarm/sdk";
import { RpcProvider } from "starknet";
import { getDB } from "../../indexers/utils/index.js";
import * as schema from "../../prisma/drizzle/schema.js";

type AnyStrategyInstance =
  | EkuboCLVault
  | UniversalStrategy<any>
  | UniversalLstMultiplierStrategy
  | VesuRebalance
  | SenseiVault;

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (error: any) {
      if (attempt >= maxRetries) {
        console.error(
          `[APY] ${operation} failed after ${maxRetries} attempts:`,
          error?.message ?? error,
        );
        throw error;
      }
      const delayMs = 1000 * attempt;
      console.warn(
        `[APY] ${operation} failed (attempt ${attempt}/${maxRetries}), retrying in ${
          delayMs / 1000
        }s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function instantiateStrategy(
  type: StrategyType,
  metadata: IStrategyMetadata<any>,
  config: ReturnType<typeof getMainnetConfig>,
  pricer: PricerFromApi,
): AnyStrategyInstance | null {
  try {
    switch (type) {
      case StrategyType.EKUBO_CL:
        return new EkuboCLVault(config, pricer, metadata);
      case StrategyType.UNIVERSAL:
        return new UniversalStrategy(config, pricer, metadata as any);
      case StrategyType.HYPER_LST:
        return new UniversalLstMultiplierStrategy(config, pricer, metadata as any);
      case StrategyType.VESU_REBALANCE:
        return new VesuRebalance(config, pricer, metadata as any);
      case StrategyType.SENSEI:
        return new SenseiVault(config, pricer, metadata as any);
      default:
        console.warn(`[APY] Unknown strategy type: ${type}`);
        return null;
    }
  } catch (error) {
    console.error(
      `[APY] Failed to instantiate strategy ${metadata.name} (${metadata.id}):`,
      error,
    );
    return null;
  }
}

/**
 * Validates and sanitizes an APY value to ensure it's a valid finite number.
 * Returns null if the value is NaN, Infinity, or -Infinity.
 */
function sanitizeAPY(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Check if value is a valid finite number
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  
  return value;
}

async function fetchNetAPY(
  type: StrategyType,
  strategy: AnyStrategyInstance,
  metadata: IStrategyMetadata<any>,
): Promise<number | null> {
  return retryWithBackoff(async () => {
    // Check if strategy has netAPY capability
    const capabilities = detectCapabilities(strategy as any);
    if (!capabilities.hasNetAPY) {
      console.warn(
        `[APY] Strategy ${metadata.name} (${metadata.id}) does not have hasNetAPY capability`,
      );
      return null;
    }

    // Call netAPY with appropriate parameters based on strategy type
    let netYieldResult: number | { net: number; splits?: any[] };

    if (strategy instanceof EkuboCLVault) {
      // EkuboCLVault requires blockIdentifier, sinceBlocks, and timeperiod parameters
      const isLST = !!metadata.additionalInfo?.lstContract;
      const blocksDiff = isLST ? 600000 : 150000;
      netYieldResult = await strategy.netAPY("latest", blocksDiff, "7d");
    } else {
      // All other strategies use parameterless netAPY()
      netYieldResult = await strategy.netAPY();
    }

    // Extract net yield from result (handle both number and NetAPYDetails)
    let netYield: number;
    if (typeof netYieldResult === "number") {
      netYield = netYieldResult;
    } else if (typeof netYieldResult === "object" && "net" in netYieldResult) {
      netYield = Number(netYieldResult.net);

      // Log detailed info for object returns (Universal strategies)
      console.log(
        `[APY] Strategy ${metadata.name} (${metadata.id}) netAPY result:`,
        JSON.stringify(netYieldResult, null, 2),
      );

      // For strategies with splits (e.g., Hyper-LST), if net is 0 but splits exist,
      // use the sum of splits as fallback
      if (netYield === 0 && netYieldResult.splits && netYieldResult.splits.length > 0) {
        const totalSplits = netYieldResult.splits.reduce(
          (sum: number, split: any) => sum + (split.apy || 0),
          0,
        );
        if (totalSplits > 0) {
          console.log(
            `[APY] Strategy ${metadata.name} (${metadata.id}): net is 0 but splits sum to ${totalSplits}, using it as netYield`,
          );
          netYield = totalSplits;
        }
      }

      // Log warning if net yield is still 0
      if (netYield === 0) {
        console.warn(
          `[APY] Strategy ${metadata.name} (${metadata.id}) returned 0 netYield. ` +
            `Result: ${JSON.stringify(netYieldResult)}. ` +
            `This may indicate: no positions, API error, or no matching pools.`,
        );
      }
    } else {
      console.warn(
        `[APY] Strategy ${metadata.name} (${metadata.id}) returned unexpected netAPY format:`,
        netYieldResult,
      );
      netYield = 0;
    }

    // Apply 10% performance fee for Universal strategies
    let baseApy: number;
    if (
      strategy instanceof UniversalStrategy ||
      strategy instanceof UniversalLstMultiplierStrategy
    ) {
      const feeFactor = 0.1;
      baseApy = netYield * (1 - feeFactor);
      console.log(
        `[APY] Strategy ${metadata.name} (${metadata.id}): Applied 10% fee. Net yield: ${netYield}, Base APY: ${baseApy}`,
      );
    } else {
      baseApy = netYield;
    }

    // Sanitize the APY value to ensure it's finite
    const sanitizedApy = sanitizeAPY(baseApy);

    if (sanitizedApy === null) {
      console.warn(
        `[APY] Invalid netAPY result for ${metadata.name} (${metadata.id}): ${baseApy}, storing as NULL`,
      );
    }

    return sanitizedApy;
  }, `netAPY for ${metadata.name} (${metadata.id})`);
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  const connectionString = process.env.POSTGRES_CONNECTION_STRING;

  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required");
  }
  if (!connectionString) {
    throw new Error("POSTGRES_CONNECTION_STRING environment variable is required");
  }

  console.log("[APY] Initializing SDK config and providers...");
  const config = getMainnetConfig(rpcUrl);
  const pricer = new PricerFromApi(config, Global.getDefaultTokens());
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const db = getDB(connectionString);

  console.log("[APY] Building strategy registry...");
  const registry = buildStrategyRegistry();
  console.log(`[APY] Found ${registry.length} strategies in registry`);

  const latestBlock = await retryWithBackoff(
    () => provider.getBlock("latest"),
    "fetch latest block",
  );
  const blockNumber = latestBlock.block_number;
  const timestamp = latestBlock.timestamp;

  console.log(
    `[APY] Using block_number=${blockNumber}, timestamp=${timestamp} for APY snapshot`,
  );

  let failedStrategies: string[] = [];
  let apys: { strategyName: string, netApy: number | null }[] = [];

  for (const entry of registry) {
    const metadata = entry.metadata as IStrategyMetadata<any>;
    const strategyId = metadata.id;
    // Convert ContractAddr to string
    const strategyAddress =
      typeof metadata.address === "string"
        ? metadata.address
        : metadata.address.address;

    console.log(`[APY] Processing strategy ${metadata.name} (${strategyId})`);

    const sdkStrategy = instantiateStrategy(entry.type, metadata, config, pricer);
    if (!sdkStrategy) {
      console.warn(
        `[APY] Skipping strategy ${metadata.name} (${strategyId}) due to instantiation failure`,
      );
      failedStrategies.push(metadata.name);
      continue;
    }

    try {
      const netApy = await fetchNetAPY(entry.type, sdkStrategy, metadata);

      // Double-check before inserting (defensive programming)
      const finalApy = sanitizeAPY(netApy);
      apys.push({ strategyName: metadata.name, netApy: finalApy });

      if (finalApy === null && netApy !== null) {
        console.warn(
          `[APY] Sanitization changed APY from ${netApy} to NULL for ${metadata.name} (${strategyId})`,
        );
      }

      await db
        .insert(schema.strategy_apy)
        .values({
          strategy_id: strategyId,
          strategy_address: strategyAddress,
          net_apy: finalApy,
          timestamp,
          block_number: blockNumber,
        })
        .onConflictDoUpdate({
          target: [schema.strategy_apy.strategy_id, schema.strategy_apy.timestamp],
          set: {
            net_apy: finalApy,
            block_number: blockNumber,
          },
        });

      console.log(
        `[APY] Stored APY for ${metadata.name} (${strategyId}): net_apy=${finalApy ?? "NULL"}`,
      );
    } catch (error: any) {
      console.error(
        `[APY] Failed to fetch/store APY for ${metadata.name} (${strategyId}):`,
        error?.message ?? error,
      );
      failedStrategies.push(metadata.name);
    }
  }

  console.log("[APY] APYs:", apys);

  if (failedStrategies.length > 0) {
    console.warn(`[APY] Failed to fetch/store APY for ${failedStrategies.length} strategies: ${failedStrategies.join(", ")}`);
    throw new Error(`Failed to fetch/store APY for ${failedStrategies.length} strategies: ${failedStrategies.join(", ")}`);
  }

  console.log("[APY] Completed APY fetch for all strategies");
}

if (require.main === module) {
  // eslint-disable-next-line no-console
  main().catch((error) => {
    console.error("[APY] Fatal error:", error);
    process.exit(1);
  });
}

export { main };


