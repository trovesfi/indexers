import "dotenv/config";

import {
  buildStrategyRegistry,
  IStrategyMetadata,
} from "@strkfarm/sdk";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
} from "drizzle-orm";

import * as schema from "../../prisma/drizzle/schema.js";
import { getDB } from "../../indexers/utils/index.js";

const ONE_DAY_SECONDS = 24 * 60 * 60;

type Mode = "audit" | "fill";

interface CliOptions {
  mode: Mode;
  startDate: string;
  endDate?: string;
  apply: boolean;
  includeZeroOnly: boolean;
  onlyFallbackApy: boolean;
  seed?: number;
  strategyId?: string;
  fallbackApy?: number;
}

interface StrategyInfo {
  strategyId: string;
  strategyName: string;
  strategyAddress: string;
}

interface StrategyDayState {
  hasNonZero: boolean;
  hasZero: boolean;
  latestTimestamp: number | null;
  latestNonZeroTimestamp: number | null;
  latestNonZeroValue: number | null;
  latestZeroTimestamp: number | null;
  latestZeroValue: number | null;
}

interface StrategySummary {
  strategyId: string;
  strategyName: string;
  expectedDays: number;
  coveredDays: number;
  zeroOnlyDays: number;
  missingDays: number;
  firstAvailableTimestamp: number | null;
}

interface BackfillCandidate {
  strategyId: string;
  strategyName: string;
  strategyAddress: string;
  dayStartTimestamp: number;
  writeTimestamp: number;
  previousValue: number;
  nextValue?: number;
  generatedValue: number;
  reason: "avg_prev_next" | "prev_random";
  replacedZeroOnly: boolean;
}

function printHelp(): void {
  console.log(`
[APY-HISTORY] Usage:
  tsx src/standalone-scripts/check-apy-history.ts --mode audit --start-date YYYY-MM-DD
  tsx src/standalone-scripts/check-apy-history.ts --mode fill --start-date YYYY-MM-DD [--end-date YYYY-MM-DD] [--apply] [--include-zero-only] [--seed N] [--strategy-id ID] [--fallback-apy VALUE] [--only-fallback-apy]

Flags:
  --mode               audit | fill
  --start-date         Inclusive start date in UTC (YYYY-MM-DD)
  --end-date           Inclusive end date in UTC (YYYY-MM-DD). Defaults to yesterday.
  --apply              Persist generated rows (fill mode only). Without this, fill is dry-run.
  --include-zero-only  Also backfill days that only have zero APY entries.
  --only-fallback-apy  Strictly generate from fallback APY (+/-5%), never from prev/next APY.
  --seed               Seed for deterministic randomization in fill mode.
  --strategy-id        Restrict audit/fill to a single strategy id.
  --fallback-apy       Used when previous day is missing; generated as fallbackApy * random(0.95..1.05).
`);
}

function parseCliArgs(argv: string[]): CliOptions {
  const args = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      continue;
    }

    if (
      token === "--apply" ||
      token === "--include-zero-only" ||
      token === "--only-fallback-apy"
    ) {
      args.set(token, true);
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    args.set(token, next);
    i += 1;
  }

  const modeRaw = args.get("--mode");
  const startDateRaw = args.get("--start-date");
  const endDateRaw = args.get("--end-date");

  if (modeRaw !== "audit" && modeRaw !== "fill") {
    throw new Error("Invalid --mode. Expected: audit | fill");
  }
  if (typeof startDateRaw !== "string") {
    throw new Error("Missing --start-date (expected YYYY-MM-DD)");
  }

  const seedRaw = args.get("--seed");
  let seed: number | undefined;
  if (typeof seedRaw === "string") {
    const parsed = Number(seedRaw);
    if (!Number.isFinite(parsed)) {
      throw new Error("Invalid --seed value. Expected a finite number.");
    }
    seed = parsed;
  }

  const fallbackApyRaw = args.get("--fallback-apy");
  let fallbackApy: number | undefined;
  if (typeof fallbackApyRaw === "string") {
    const parsed = Number(fallbackApyRaw);
    if (!Number.isFinite(parsed)) {
      throw new Error("Invalid --fallback-apy value. Expected a finite number.");
    }
    fallbackApy = parsed;
  }

  return {
    mode: modeRaw,
    startDate: startDateRaw,
    endDate: typeof endDateRaw === "string" ? endDateRaw : undefined,
    apply: args.get("--apply") === true,
    includeZeroOnly: args.get("--include-zero-only") === true,
    onlyFallbackApy: args.get("--only-fallback-apy") === true,
    seed,
    strategyId:
      typeof args.get("--strategy-id") === "string"
        ? (args.get("--strategy-id") as string)
        : undefined,
    fallbackApy,
  };
}

function parseUtcDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day, 0, 0, 0) / 1000;
  const check = new Date(timestamp * 1000);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${date}`);
  }

  return timestamp;
}

function toIsoDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function getTodayUtcStartTimestamp(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
}

function dayStartTimestamp(timestamp: number): number {
  return Math.floor(timestamp / ONE_DAY_SECONDS) * ONE_DAY_SECONDS;
}

function listExpectedDays(startTimestamp: number, endTimestamp: number): number[] {
  const days: number[] = [];
  for (let ts = startTimestamp; ts <= endTimestamp; ts += ONE_DAY_SECONDS) {
    days.push(ts);
  }
  return days;
}

function createSeededRandom(seed: number): () => number {
  // Mulberry32: tiny deterministic PRNG suitable for reproducible simulations.
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getStrategyListFromRegistry(): StrategyInfo[] {
  const registry = buildStrategyRegistry();
  const byId = new Map<string, StrategyInfo>();

  for (const entry of registry) {
    const metadata = entry.metadata as IStrategyMetadata<any>;
    const strategyId = metadata.id;
    const strategyAddress =
      typeof metadata.address === "string"
        ? metadata.address
        : metadata.address.address;

    if (!byId.has(strategyId)) {
      byId.set(strategyId, {
        strategyId,
        strategyName: metadata.name,
        strategyAddress,
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.strategyName.localeCompare(b.strategyName));
}

function classifyDayState(dayState?: StrategyDayState): "covered" | "zero_only" | "missing" {
  if (!dayState) {
    return "missing";
  }
  // Day is considered covered as soon as at least one non-zero APY exists.
  if (dayState.hasNonZero) {
    return "covered";
  }
  // Zero-only is a separate category (saved row exists, but no non-zero APY).
  if (dayState.hasZero) {
    return "zero_only";
  }
  return "missing";
}

function representativeValue(dayState?: StrategyDayState): number | undefined {
  if (!dayState) {
    return undefined;
  }
  // Prefer non-zero values for interpolation when available.
  if (dayState.latestNonZeroValue !== null) {
    return dayState.latestNonZeroValue;
  }
  // Fallback to zero if the day only has zero APY rows.
  if (dayState.latestZeroValue !== null) {
    return dayState.latestZeroValue;
  }
  return undefined;
}

async function loadDayStates(
  db: ReturnType<typeof getDB>,
  strategyIds: string[],
  startTimestamp: number,
  endTimestamp: number,
): Promise<Map<string, Map<number, StrategyDayState>>> {
  const statesByStrategy = new Map<string, Map<number, StrategyDayState>>();

  if (strategyIds.length === 0) {
    return statesByStrategy;
  }

  const rows = await db
    .select({
      strategyId: schema.strategy_apy.strategy_id,
      timestamp: schema.strategy_apy.timestamp,
      netApy: schema.strategy_apy.net_apy,
    })
    .from(schema.strategy_apy)
    .where(
      and(
        inArray(schema.strategy_apy.strategy_id, strategyIds),
        gte(schema.strategy_apy.timestamp, startTimestamp),
        lte(schema.strategy_apy.timestamp, endTimestamp),
      ),
    );

  for (const row of rows) {
    const strategyId = row.strategyId;
    const dayTs = dayStartTimestamp(row.timestamp);
    let perStrategy = statesByStrategy.get(strategyId);

    if (!perStrategy) {
      // Initialize per-strategy day bucket map on first row for this strategy.
      perStrategy = new Map<number, StrategyDayState>();
      statesByStrategy.set(strategyId, perStrategy);
    }

    let dayState = perStrategy.get(dayTs);
    if (!dayState) {
      // Initialize day bucket; fields track category presence and latest examples.
      dayState = {
        hasNonZero: false,
        hasZero: false,
        latestTimestamp: null,
        latestNonZeroTimestamp: null,
        latestNonZeroValue: null,
        latestZeroTimestamp: null,
        latestZeroValue: null,
      };
      perStrategy.set(dayTs, dayState);
    }

    if (dayState.latestTimestamp === null || row.timestamp > dayState.latestTimestamp) {
      dayState.latestTimestamp = row.timestamp;
    }

    // Null APY rows are not counted as covered/zero; they only prove that a row existed.
    if (row.netApy === null) {
      continue;
    }

    if (row.netApy === 0) {
      // Zero APY exists for this day; still a valid stored-data category.
      dayState.hasZero = true;
      if (dayState.latestZeroTimestamp === null || row.timestamp > dayState.latestZeroTimestamp) {
        dayState.latestZeroTimestamp = row.timestamp;
        dayState.latestZeroValue = row.netApy;
      }
      continue;
    }

    // Any non-zero APY marks the whole day as covered.
    dayState.hasNonZero = true;
    if (dayState.latestNonZeroTimestamp === null || row.timestamp > dayState.latestNonZeroTimestamp) {
      dayState.latestNonZeroTimestamp = row.timestamp;
      dayState.latestNonZeroValue = row.netApy;
    }
  }

  return statesByStrategy;
}

async function loadFirstAvailableByStrategy(
  db: ReturnType<typeof getDB>,
  strategyIds: string[],
): Promise<Map<string, number>> {
  const firstAvailable = new Map<string, number>();

  if (strategyIds.length === 0) {
    return firstAvailable;
  }

  const rows = await db
    .select({
      strategyId: schema.strategy_apy.strategy_id,
      timestamp: schema.strategy_apy.timestamp,
    })
    .from(schema.strategy_apy)
    .where(
      and(
        inArray(schema.strategy_apy.strategy_id, strategyIds),
        isNotNull(schema.strategy_apy.net_apy),
      ),
    )
    .orderBy(asc(schema.strategy_apy.timestamp));

  for (const row of rows) {
    if (!firstAvailable.has(row.strategyId)) {
      firstAvailable.set(row.strategyId, row.timestamp);
    }
  }

  return firstAvailable;
}

async function runAudit(
  db: ReturnType<typeof getDB>,
  strategies: StrategyInfo[],
  startTimestamp: number,
  endTimestamp: number,
): Promise<{
  summaries: StrategySummary[];
  statesByStrategy: Map<string, Map<number, StrategyDayState>>;
  expectedDays: number[];
}> {
  const strategyIds = strategies.map((s) => s.strategyId);
  const [statesByStrategy, firstAvailableByStrategy] = await Promise.all([
    loadDayStates(db, strategyIds, startTimestamp, endTimestamp),
    loadFirstAvailableByStrategy(db, strategyIds),
  ]);
  const expectedDays = listExpectedDays(startTimestamp, endTimestamp);

  const summaries: StrategySummary[] = strategies.map((strategy) => {
    const perDay = statesByStrategy.get(strategy.strategyId);

    let coveredDays = 0;
    let zeroOnlyDays = 0;
    let missingDays = 0;

    for (const dayTs of expectedDays) {
      const status = classifyDayState(perDay?.get(dayTs));
      if (status === "covered") {
        coveredDays += 1;
      } else if (status === "zero_only") {
        zeroOnlyDays += 1;
      } else {
        missingDays += 1;
      }
    }

    return {
      strategyId: strategy.strategyId,
      strategyName: strategy.strategyName,
      expectedDays: expectedDays.length,
      coveredDays,
      zeroOnlyDays,
      missingDays,
      firstAvailableTimestamp: firstAvailableByStrategy.get(strategy.strategyId) ?? null,
    };
  });

  summaries.sort((a, b) => b.missingDays - a.missingDays || a.strategyName.localeCompare(b.strategyName));

  const totalExpected = summaries.reduce((sum, item) => sum + item.expectedDays, 0);
  const totalCovered = summaries.reduce((sum, item) => sum + item.coveredDays, 0);
  const totalZeroOnly = summaries.reduce((sum, item) => sum + item.zeroOnlyDays, 0);
  const totalMissing = summaries.reduce((sum, item) => sum + item.missingDays, 0);

  console.log(
    `[APY-HISTORY] Audit range: ${toIsoDate(startTimestamp)} -> ${toIsoDate(endTimestamp)} (UTC)`,
  );
  console.log(`[APY-HISTORY] Strategies: ${summaries.length}`);
  console.log(
    `[APY-HISTORY] Global totals | expected=${totalExpected} covered=${totalCovered} zero_only=${totalZeroOnly} missing=${totalMissing}`,
  );
  console.log("[APY-HISTORY] Per-strategy summary:");

  for (const summary of summaries) {
    const firstAvailable = summary.firstAvailableTimestamp
      ? toIsoDate(dayStartTimestamp(summary.firstAvailableTimestamp))
      : "N/A";

    console.log(
      `  - ${summary.strategyName} (${summary.strategyId}) | expected=${summary.expectedDays} covered=${summary.coveredDays} zero_only=${summary.zeroOnlyDays} missing=${summary.missingDays} first_available=${firstAvailable}`,
    );
  }

  // Final summary focuses on strategies with meaningful missing coverage gaps.
  const strategiesAboveMissingThreshold = summaries
    .map((summary) => {
      const expected = summary.expectedDays;
      const missingPct = expected === 0 ? 0 : (summary.missingDays / expected) * 100;
      // "Covered" here means non-missing days (covered + zero-only).
      const coveredPct = expected === 0
        ? 100
        : ((summary.coveredDays + summary.zeroOnlyDays) / expected) * 100;

      return {
        strategyId: summary.strategyId,
        strategyName: summary.strategyName,
        missingPct,
        coveredPct,
      };
    })
    .filter((item) => item.missingPct > 5)
    .sort((a, b) => b.missingPct - a.missingPct || a.strategyName.localeCompare(b.strategyName));

  console.log("[APY-HISTORY] Final summary (>5% missing days):");
  if (strategiesAboveMissingThreshold.length === 0) {
    console.log("  - None");
  } else {
    for (const item of strategiesAboveMissingThreshold) {
      console.log(
        `  - ${item.strategyName} (${item.strategyId}) | missing_pct=${item.missingPct.toFixed(2)} covered_pct=${item.coveredPct.toFixed(2)}`,
      );
    }
  }

  return {
    summaries,
    statesByStrategy,
    expectedDays,
  };
}

async function populateMissingValues(
  db: ReturnType<typeof getDB>,
  strategies: StrategyInfo[],
  statesByStrategy: Map<string, Map<number, StrategyDayState>>,
  expectedDays: number[],
  options: {
    apply: boolean;
    includeZeroOnly: boolean;
    onlyFallbackApy: boolean;
    seed?: number;
    fallbackApy?: number;
  },
): Promise<void> {
  const random =
    options.seed !== undefined
      ? createSeededRandom(options.seed)
      : Math.random;

  const candidates: BackfillCandidate[] = [];
  const unresolved: Array<{ strategyName: string; strategyId: string; dayStartTimestamp: number }> = [];

  for (const strategy of strategies) {
    let dayMap = statesByStrategy.get(strategy.strategyId);
    if (!dayMap) {
      dayMap = new Map<number, StrategyDayState>();
      statesByStrategy.set(strategy.strategyId, dayMap);
    }

    for (const dayTs of expectedDays) {
      const currentState = dayMap.get(dayTs);
      const status = classifyDayState(currentState);
      // By default fill only missing days; zero-only can be optionally included.
      const shouldBackfill =
        status === "missing" || (options.includeZeroOnly && status === "zero_only");

      if (!shouldBackfill) {
        continue;
      }

      const prevState = dayMap.get(dayTs - ONE_DAY_SECONDS);
      const nextState = dayMap.get(dayTs + ONE_DAY_SECONDS);
      const prevValue = representativeValue(prevState);
      const nextValue = representativeValue(nextState);

      if (prevValue === undefined && options.fallbackApy === undefined) {
        // Do not synthesize from nothing unless fallback APY is explicitly provided.
        unresolved.push({
          strategyName: strategy.strategyName,
          strategyId: strategy.strategyId,
          dayStartTimestamp: dayTs,
        });
        continue;
      }

      let generatedValue: number;
      let valueUsedAsPrevious: number;
      let valueUsedAsNext: number | undefined;

      if (options.onlyFallbackApy) {
        // Strict mode: never look at prev/next observed values; always use fallback baseline.
        const fallbackValue = options.fallbackApy as number;
        generatedValue = fallbackValue * (0.95 + random() * 0.1);
        valueUsedAsPrevious = fallbackValue;
        valueUsedAsNext = undefined;
      } else if (prevValue === undefined) {
        // No previous data; use provided fallback baseline with +/- 5% jitter.
        const fallbackValue = options.fallbackApy as number;
        generatedValue = fallbackValue * (0.95 + random() * 0.1);
        valueUsedAsPrevious = fallbackValue;
        valueUsedAsNext = undefined;
      } else if (nextValue !== undefined) {
        // Preferred: interpolate between previous and next known day values.
        generatedValue = (prevValue + nextValue) / 2;
        valueUsedAsPrevious = prevValue;
        valueUsedAsNext = nextValue;
      } else {
        // Fallback: carry previous value with small random perturbation (+/- 5%).
        generatedValue = prevValue * (0.95 + random() * 0.1);
        valueUsedAsPrevious = prevValue;
        valueUsedAsNext = undefined;
      }

      // Reuse latest row timestamp when replacing zero-only; otherwise default to day start.
      const writeTimestamp = currentState?.latestTimestamp ?? dayTs;
      const backfillReason = valueUsedAsNext !== undefined ? "avg_prev_next" : "prev_random";
      const replacedZeroOnly = status === "zero_only";

      candidates.push({
        strategyId: strategy.strategyId,
        strategyName: strategy.strategyName,
        strategyAddress: strategy.strategyAddress,
        dayStartTimestamp: dayTs,
        writeTimestamp,
        previousValue: valueUsedAsPrevious,
        nextValue: valueUsedAsNext,
        generatedValue,
        reason: backfillReason,
        replacedZeroOnly,
      });

      dayMap.set(dayTs, {
        hasNonZero: generatedValue !== 0,
        hasZero: generatedValue === 0,
        latestTimestamp: writeTimestamp,
        latestNonZeroTimestamp: generatedValue !== 0 ? writeTimestamp : null,
        latestNonZeroValue: generatedValue !== 0 ? generatedValue : null,
        latestZeroTimestamp: generatedValue === 0 ? writeTimestamp : null,
        latestZeroValue: generatedValue === 0 ? generatedValue : null,
      });
    }
  }

  const missingOnlyCount = candidates.filter((c) => !c.replacedZeroOnly).length;
  const zeroOnlyCount = candidates.filter((c) => c.replacedZeroOnly).length;

  console.log(
    `[APY-HISTORY] Backfill candidates | total=${candidates.length} missing_only=${missingOnlyCount} zero_only=${zeroOnlyCount} unresolved=${unresolved.length}`,
  );

  if (candidates.length > 0) {
    console.log("[APY-HISTORY] Candidate preview (first 30):");
    for (const candidate of candidates.slice(0, 30)) {
      const next = candidate.nextValue === undefined ? "N/A" : candidate.nextValue.toFixed(8);
      console.log(
        `  - ${candidate.strategyName} (${candidate.strategyId}) day=${toIsoDate(candidate.dayStartTimestamp)} value=${candidate.generatedValue.toFixed(8)} prev=${candidate.previousValue.toFixed(8)} next=${next} reason=${candidate.reason} write_ts=${candidate.writeTimestamp}`,
      );
    }
  }

  if (unresolved.length > 0) {
    console.log("[APY-HISTORY] Unresolved days (first 30):");
    for (const item of unresolved.slice(0, 30)) {
      console.log(
        `  - ${item.strategyName} (${item.strategyId}) day=${toIsoDate(item.dayStartTimestamp)} reason=no_previous_value`,
      );
    }
  }

  if (!options.apply) {
    console.log("[APY-HISTORY] Dry run complete (no database writes). Use --apply to persist.");
    return;
  }

  for (const candidate of candidates) {
    await db
      .insert(schema.strategy_apy)
      .values({
        strategy_id: candidate.strategyId,
        strategy_address: candidate.strategyAddress,
        net_apy: candidate.generatedValue,
        timestamp: candidate.writeTimestamp,
        block_number: null,
      })
      .onConflictDoUpdate({
        target: [schema.strategy_apy.strategy_id, schema.strategy_apy.timestamp],
        set: {
          net_apy: candidate.generatedValue,
          strategy_address: candidate.strategyAddress,
          block_number: null,
        },
      });
  }

  console.log(`[APY-HISTORY] Persisted ${candidates.length} backfilled entries.`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseCliArgs(process.argv.slice(2));
  const connectionString = process.env.POSTGRES_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error("POSTGRES_CONNECTION_STRING environment variable is required");
  }

  const startTimestamp = parseUtcDate(options.startDate);
  const maxAllowedEndTimestamp = getTodayUtcStartTimestamp() - ONE_DAY_SECONDS;
  const endTimestamp = options.endDate
    ? parseUtcDate(options.endDate)
    : maxAllowedEndTimestamp;

  if (endTimestamp > maxAllowedEndTimestamp) {
    throw new Error(
      `End date must be <= yesterday. end=${toIsoDate(endTimestamp)}, yesterday=${toIsoDate(maxAllowedEndTimestamp)}`,
    );
  }

  if (startTimestamp > endTimestamp) {
    throw new Error(
      `Start date must be <= end date. start=${options.startDate}, end=${toIsoDate(endTimestamp)}`,
    );
  }
  if (options.onlyFallbackApy && options.fallbackApy === undefined) {
    throw new Error("--only-fallback-apy requires --fallback-apy to be provided");
  }

  const db = getDB(connectionString);
  let strategies = getStrategyListFromRegistry();
  if (options.strategyId) {
    strategies = strategies.filter((strategy) => strategy.strategyId === options.strategyId);
    if (strategies.length === 0) {
      throw new Error(
        `Strategy id '${options.strategyId}' was not found in SDK registry`,
      );
    }
  }
  const strategyNamesPreview = strategies.slice(0, 5).map((s) => s.strategyName).join(", ");

  console.log(`[APY-HISTORY] Loaded ${strategies.length} strategies from SDK registry.`);
  console.log(`[APY-HISTORY] Strategy preview: ${strategyNamesPreview}`);

  const { statesByStrategy, expectedDays } = await runAudit(
    db,
    strategies,
    startTimestamp,
    endTimestamp,
  );

  if (options.mode === "fill") {
    await populateMissingValues(
      db,
      strategies,
      statesByStrategy,
      expectedDays,
      {
        apply: options.apply,
        includeZeroOnly: options.includeZeroOnly,
        onlyFallbackApy: options.onlyFallbackApy,
        seed: options.seed,
        fallbackApy: options.fallbackApy,
      },
    );

    console.log("[APY-HISTORY] Re-running audit after fill...");
    await runAudit(db, strategies, startTimestamp, endTimestamp);
  }
}

async function deleteApyHistory() {
  const strategyId = 'hyper_xstrk';
  const startTimestamp = parseUtcDate('2026-02-07');
  const endTimestamp = getTodayUtcStartTimestamp() - ONE_DAY_SECONDS;
  const connectionString = process.env.POSTGRES_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("POSTGRES_CONNECTION_STRING environment variable is required");
  }
  const db = getDB(connectionString);
  const result = await db.delete(schema.strategy_apy).where(
    and(
      eq(schema.strategy_apy.strategy_id, strategyId),
      gte(schema.strategy_apy.timestamp, startTimestamp),
      lte(schema.strategy_apy.timestamp, endTimestamp),
    ),
  );
  console.log(`[APY-HISTORY] Deleted ${result.rowCount} rows for strategy ${strategyId} from ${toIsoDate(startTimestamp)} to ${toIsoDate(endTimestamp)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[APY-HISTORY] Fatal error:", error);
    process.exit(1);
  });
  // deleteApyHistory().catch((error) => {
  //   console.error("[APY-HISTORY] Fatal error:", error);
  //   process.exit(1);
  // });
}

export { main, runAudit, populateMissingValues };
