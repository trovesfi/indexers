import { Resolver, Query, Arg, Int, ObjectType, Field } from "type-graphql";
import { PrismaClient } from "@prisma/client";
import { standariseAddress } from "@/utils";
import {
  getVesuExtendedIndexerProfiles,
  type VesuExtendedIndexerProfile,
} from "../../../indexers/utils/configs/vesu_extended_vault_ops";

const prisma = new PrismaClient();

function decimalsForToken(
  profile: VesuExtendedIndexerProfile,
  token: string,
): number {
  const t = standariseAddress(token);
  if (t === profile.collateral) return profile.collateralDecimals;
  if (t === profile.debt) return profile.debtDecimals;
  return 18;
}

function isUsdcToken(
  profile: VesuExtendedIndexerProfile,
  token: string,
): boolean {
  const t = standariseAddress(token);
  return (
    t === standariseAddress(profile.usdc) || t === standariseAddress(profile.debt)
  );
}

/**
 * Execution price for display + UI PnL:
 * - If one leg is USDC: USDC amount / other token amount (decimal-adjusted, absolute notion).
 * - Else: token1/token0 (human, decimal-adjusted).
 */
function computeEkuboSwapExec(
  profile: VesuExtendedIndexerProfile,
  pathLabel: string,
  token0: string,
  token1: string,
  d0s: string,
  d1s: string,
): Record<string, string> | null {
  let d0: bigint;
  let d1: bigint;
  try {
    d0 = BigInt(d0s);
    d1 = BigInt(d1s);
  } catch {
    return null;
  }
  const dec0 = decimalsForToken(profile, token0);
  const dec1 = decimalsForToken(profile, token1);
  const h0 = Number(d0) / 10 ** dec0;
  const h1 = Number(d1) / 10 ** dec1;
  const a0 = Math.abs(h0);
  const a1 = Math.abs(h1);
  if (a0 < 1e-300 && a1 < 1e-300) return null;

  const u0 = isUsdcToken(profile, token0);
  const u1 = isUsdcToken(profile, token1);
  const coll = standariseAddress(profile.collateral);

  const fmtN = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 8 });

  if (u0 && !u1) {
    if (a1 < 1e-300) return null;
    const usdcPerOther = a0 / a1;
    const refTok = token1;
    const refLabel = standariseAddress(refTok) === coll ? "collateral" : "token1";
    const wColl = standariseAddress(refTok) === coll ? a1.toString() : "0";
    return {
      path: pathLabel,
      token0,
      token1,
      delta0_signed: d0s,
      delta1_signed: d1s,
      usdc_per_reference_unit: usdcPerOther.toString(),
      reference_token: refTok,
      collateral_abs_human_for_weight: wColl,
      token1_per_token0_human: "",
      display: `${pathLabel}: ≈ ${fmtN(usdcPerOther)} USDC / 1 ${refLabel}`,
    };
  }
  if (u1 && !u0) {
    if (a0 < 1e-300) return null;
    const usdcPerOther = a1 / a0;
    const refTok = token0;
    const refLabel = standariseAddress(refTok) === coll ? "collateral" : "token0";
    const wColl = standariseAddress(refTok) === coll ? a0.toString() : "0";
    return {
      path: pathLabel,
      token0,
      token1,
      delta0_signed: d0s,
      delta1_signed: d1s,
      usdc_per_reference_unit: usdcPerOther.toString(),
      reference_token: refTok,
      collateral_abs_human_for_weight: wColl,
      token1_per_token0_human: "",
      display: `${pathLabel}: ≈ ${fmtN(usdcPerOther)} USDC / 1 ${refLabel}`,
    };
  }
  if (!u0 && !u1) {
    if (a0 < 1e-300) return null;
    const t1PerT0 = a1 / a0;
    return {
      path: pathLabel,
      token0,
      token1,
      delta0_signed: d0s,
      delta1_signed: d1s,
      usdc_per_reference_unit: "",
      reference_token: "",
      collateral_abs_human_for_weight: "",
      token1_per_token0_human: t1PerT0.toString(),
      display: `${pathLabel}: token1/token0 ≈ ${fmtN(t1PerT0)}`,
    };
  }
  return null;
}

function blendUsdcPerCollateral(
  profile: VesuExtendedIndexerProfile,
  execs: Record<string, string>[],
): string | null {
  const coll = standariseAddress(profile.collateral);
  let sumW = 0;
  let sumPxW = 0;
  for (const e of execs) {
    const ref = e.reference_token;
    const pxS = e.usdc_per_reference_unit;
    const wS = e.collateral_abs_human_for_weight;
    if (!ref || !pxS || pxS === "") continue;
    if (standariseAddress(ref) !== coll) continue;
    const px = Number(pxS);
    const w = Number(wS);
    if (!Number.isFinite(px) || !Number.isFinite(w) || w <= 0 || px <= 0)
      continue;
    sumW += w;
    sumPxW += px * w;
  }
  if (sumW <= 0) return null;
  return (sumPxW / sumW).toString();
}

function buildVesuModifyDetailJson(
  r: {
    tx_hash: string;
    event_index: number;
    pool_contract: string;
    collateral_asset: string;
    debt_asset: string;
    user_address: string;
    collateral_delta: string;
    debt_delta: string;
    nominal_debt_delta: string;
  },
  levers: Array<{
    tx_hash: string;
    event_index: number;
    user_address: string;
    collateral_asset: string;
    debt_asset: string;
    lever_kind: string;
    margin: string;
    collateral_delta: string;
    debt_delta: string;
  }>,
  swaps: Array<{
    tx_hash: string;
    event_index: number;
    token0: string;
    token1: string;
    delta0_signed: string;
    delta1_signed: string;
  }>,
  profile: VesuExtendedIndexerProfile | undefined,
  allModifies: Array<{
    tx_hash: string;
    event_index: number;
    pool_contract: string;
  }>,
): Record<string, unknown> {
  const pool = standariseAddress(r.pool_contract);
  const prevModifyIdx = allModifies
    .filter(
      (m) =>
        m.tx_hash === r.tx_hash &&
        standariseAddress(m.pool_contract) === pool &&
        m.event_index < r.event_index,
    )
    .reduce((max, m) => Math.max(max, m.event_index), -1);

  const leverCandidates = levers
    .filter(
      (l) =>
        l.tx_hash === r.tx_hash &&
        standariseAddress(l.user_address) ===
          standariseAddress(r.user_address) &&
        standariseAddress(l.collateral_asset) ===
          standariseAddress(r.collateral_asset) &&
        standariseAddress(l.debt_asset) === standariseAddress(r.debt_asset) &&
        l.event_index > r.event_index,
    )
    .sort((a, b) => a.event_index - b.event_index);

  let lever: (typeof leverCandidates)[0] | undefined;
  for (const l of leverCandidates) {
    const interveningPoolMod = allModifies.some(
      (m) =>
        m.tx_hash === r.tx_hash &&
        standariseAddress(m.pool_contract) === pool &&
        m.event_index > r.event_index &&
        m.event_index < l.event_index,
    );
    if (!interveningPoolMod) {
      lever = l;
      break;
    }
  }

  const swapsTx = swaps
    .filter((s) => s.tx_hash === r.tx_hash)
    .sort((a, b) => a.event_index - b.event_index);

  const ekuboInWindow = swapsTx.filter(
    (s) =>
      s.event_index > prevModifyIdx && s.event_index < r.event_index,
  );

  const marginSwap = ekuboInWindow[0];
  const debtSwap = ekuboInWindow[1];
  const ekuboSwapExec: Record<string, string>[] = [];
  if (profile) {
    if (marginSwap) {
      const ex = computeEkuboSwapExec(
        profile,
        "Margin path",
        marginSwap.token0,
        marginSwap.token1,
        marginSwap.delta0_signed,
        marginSwap.delta1_signed,
      );
      if (ex) ekuboSwapExec.push(ex);
    }
    if (debtSwap) {
      const ex = computeEkuboSwapExec(
        profile,
        "Debt→coll path",
        debtSwap.token0,
        debtSwap.token1,
        debtSwap.delta0_signed,
        debtSwap.delta1_signed,
      );
      if (ex) ekuboSwapExec.push(ex);
    }
  }
  const executionUsdcPerCollateral =
    profile && ekuboSwapExec.length
      ? blendUsdcPerCollateral(profile, ekuboSwapExec)
      : null;

  let leverSplit: Record<string, string> | undefined;
  if (lever && lever.lever_kind === "increase") {
    try {
      const m = BigInt(lever.margin);
      const cd = BigInt(lever.collateral_delta);
      const fromSwap = cd - m;
      leverSplit = {
        margin_collateral_raw: lever.margin,
        collateral_from_swap_raw: fromSwap.toString(),
      };
    } catch {
      leverSplit = undefined;
    }
  }

  return {
    pool_contract: r.pool_contract,
    collateral_delta: r.collateral_delta,
    debt_delta: r.debt_delta,
    nominal_debt_delta: r.nominal_debt_delta,
    multiply_lever: lever
      ? {
          lever_kind: lever.lever_kind,
          margin: lever.margin,
          collateral_delta: lever.collateral_delta,
          debt_delta: lever.debt_delta,
        }
      : undefined,
    lever_collateral_split: leverSplit,
    ekubo_swap_exec: ekuboSwapExec,
    execution_usdc_per_collateral: executionUsdcPerCollateral,
  };
}

@ObjectType()
export class VesuExtendedTimelineEntry {
  @Field(() => String)
  source!: string;

  @Field(() => Int)
  timestamp!: number;

  @Field(() => String, { nullable: true })
  tx_hash!: string | null;

  @Field(() => Int, { nullable: true })
  block_number!: number | null;

  @Field(() => String)
  detail_json!: string;
}

@ObjectType()
export class VesuExtendedUsdcSummary {
  /** Net USDC (raw 6-decimal units) into VA minus out from VA for classified transfer flows (indexed only). */
  @Field(() => String)
  net_usdc_transfers_raw!: string;

  /** Net USDC (raw 6-decimal units) into wallet minus out from wallet on the strategy wallet (indexed transfers only). */
  @Field(() => String)
  net_wallet_usdc_transfers_raw!: string;

  @Field(() => String)
  sum_extended_deposits_quantized!: string;

  @Field(() => String)
  sum_extended_trades_value!: string;

  @Field(() => String)
  sum_extended_trades_fee!: string;

  /** Baseline VA USDC in raw 6-decimal units (not indexed; from args or env). */
  @Field(() => String)
  baseline_va_usdc_raw!: string;

  /** Baseline wallet USDC in raw 6-decimal units (not indexed). */
  @Field(() => String)
  baseline_wallet_usdc_raw!: string;

  /** Baseline Extended “free” USDC in Extended deposit quanta (not indexed). */
  @Field(() => String)
  baseline_extended_free_quantized!: string;

  /** baseline_va_usdc_raw + net_usdc_transfers_raw (estimated VA-side USDC). */
  @Field(() => String)
  va_usdc_raw_estimated!: string;

  /** baseline_wallet_usdc_raw + net_wallet_usdc_transfers_raw. */
  @Field(() => String)
  wallet_usdc_raw_estimated!: string;

  /** baseline_extended_free_quantized + sum_extended_deposits_quantized. */
  @Field(() => String)
  extended_deposits_quantized_estimated!: string;
}

type CapitalBaselineJsonEntry = {
  vaUsdcRaw?: string;
  walletUsdcRaw?: string;
  extendedFreeQuantized?: string;
};

function loadCapitalBaselinesByStrategy(): Record<string, CapitalBaselineJsonEntry> | null {
  const raw = process.env.VESU_EXTENDED_CAPITAL_BASELINES?.trim();
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, CapitalBaselineJsonEntry>;
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function parseBigintString(v: string | null | undefined): bigint | null {
  if (v == null) return null;
  const t = v.trim();
  if (t === "") return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

/**
 * Resolution order per field: non-empty GraphQL arg → VESU_EXTENDED_CAPITAL_BASELINES[strategy_id] → global env → 0.
 */
function resolveCapitalBaselines(
  jsonRow: CapitalBaselineJsonEntry | undefined,
  args: {
    initial_va_usdc_raw?: string | null;
    initial_wallet_usdc_raw?: string | null;
    initial_extended_free_quantized?: string | null;
  },
): { va: bigint; wallet: bigint; extendedQ: bigint } {
  const va =
    parseBigintString(args.initial_va_usdc_raw) ??
    parseBigintString(jsonRow?.vaUsdcRaw) ??
    parseBigintString(process.env.VESU_EXTENDED_INITIAL_VA_USDC_RAW) ??
    0n;
  const wallet =
    parseBigintString(args.initial_wallet_usdc_raw) ??
    parseBigintString(jsonRow?.walletUsdcRaw) ??
    parseBigintString(process.env.VESU_EXTENDED_INITIAL_WALLET_USDC_RAW) ??
    0n;
  const extendedQ =
    parseBigintString(args.initial_extended_free_quantized) ??
    parseBigintString(jsonRow?.extendedFreeQuantized) ??
    parseBigintString(
      process.env.VESU_EXTENDED_INITIAL_EXTENDED_FREE_QUANTIZED,
    ) ??
    0n;
  return { va, wallet, extendedQ };
}

function sortKeyTs(ts: number, block: number, tx: number, ev: number): number {
  if (ts > 0) return ts;
  return block * 1_000_000 + tx * 1000 + ev;
}

/** Parse API decimal string to micro-units (6 dp) for integer aggregation. */
function decimalToMicros(s: string): bigint {
  const t = s.trim();
  if (!t) return 0n;
  const [whole, frac = ""] = t.split(".");
  const w = BigInt(whole || "0");
  const f = (frac + "000000").slice(0, 6);
  return w * 1_000_000n + BigInt(f || "0");
}

@Resolver()
export class VesuExtendedVaultOpsResolver {
  @Query(() => [VesuExtendedTimelineEntry])
  async vesuExtendedVaultOpsTimeline(
    @Arg("strategy_id", () => String) strategy_id: string,
    @Arg("limit", () => Int, { defaultValue: 200 }) limit: number,
  ): Promise<VesuExtendedTimelineEntry[]> {
    const sid = strategy_id.trim();
    const profile = getVesuExtendedIndexerProfiles().find(
      (p) => p.strategyId === sid,
    );

    const [
      transfers,
      modifies,
      deposits,
      trades,
    ] = await Promise.all([
      prisma.vesu_extended_usdc_transfers.findMany({
        where: { strategy_id: sid },
        orderBy: [
          { block_number: "desc" },
          { tx_index: "desc" },
          { event_index: "desc" },
        ],
        take: limit,
      }),
      prisma.vesu_extended_modify_position.findMany({
        where: { strategy_id: sid },
        orderBy: [
          { block_number: "desc" },
          { tx_index: "desc" },
          { event_index: "desc" },
        ],
        take: limit,
      }),
      prisma.vesu_extended_core_deposits.findMany({
        where: { strategy_id: sid },
        orderBy: [
          { block_number: "desc" },
          { tx_index: "desc" },
          { event_index: "desc" },
        ],
        take: limit,
      }),
      prisma.extended_trades.findMany({
        where: { strategy_id: sid },
        orderBy: { created_time: "desc" },
        take: limit,
      }),
    ]);

    const modifyTxHashes = [...new Set(modifies.map((m) => m.tx_hash))];
    const [multiplyLevers, ekuboSwaps] =
      modifyTxHashes.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.vesu_extended_multiply_lever.findMany({
              where: {
                strategy_id: sid,
                tx_hash: { in: modifyTxHashes },
              },
            }),
            prisma.vesu_extended_ekubo_swapped.findMany({
              where: {
                strategy_id: sid,
                tx_hash: { in: modifyTxHashes },
              },
            }),
          ]);

    const out: VesuExtendedTimelineEntry[] = [];

    for (const r of transfers) {
      out.push({
        source: "usdc_transfer",
        timestamp: r.timestamp,
        tx_hash: r.tx_hash,
        block_number: r.block_number,
        detail_json: JSON.stringify({
          flow_type: r.flow_type,
          from_address: r.from_address,
          to_address: r.to_address,
          amount: r.amount,
          tx_hash: r.tx_hash,
          block_number: r.block_number,
        }),
      });
    }
    for (const r of modifies) {
      out.push({
        source: "vesu_modify_position",
        timestamp: r.timestamp,
        tx_hash: r.tx_hash,
        block_number: r.block_number,
        detail_json: JSON.stringify(
          buildVesuModifyDetailJson(
            r,
            multiplyLevers,
            ekuboSwaps,
            profile,
            modifies,
          ),
        ),
      });
    }
    for (const r of deposits) {
      out.push({
        source: "extended_deposit",
        timestamp: r.timestamp,
        tx_hash: r.tx_hash,
        block_number: r.block_number,
        detail_json: JSON.stringify({
          quantized_amount: r.quantized_amount,
          collateral_id: r.collateral_id,
        }),
      });
    }
    for (const r of trades) {
      const ms = Number(r.created_time);
      const tsSec = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
      out.push({
        source: "extended_trade",
        timestamp: tsSec,
        tx_hash: null,
        block_number: null,
        detail_json: JSON.stringify({
          trade_id: r.trade_id,
          market: r.market,
          side: r.side,
          qty: r.qty,
          value: r.value,
          fee: r.fee,
          price: r.price,
          trade_type: r.trade_type,
          created_time: r.created_time,
        }),
      });
    }

    out.sort((a, b) => {
      const ka = sortKeyTs(
        a.timestamp,
        a.block_number ?? 0,
        0,
        0,
      );
      const kb = sortKeyTs(
        b.timestamp,
        b.block_number ?? 0,
        0,
        0,
      );
      return kb - ka;
    });

    return out.slice(0, limit);
  }

  @Query(() => VesuExtendedUsdcSummary)
  async vesuExtendedUsdcSummary(
    @Arg("strategy_id", () => String) strategy_id: string,
    @Arg("initial_va_usdc_raw", () => String, { nullable: true })
    initial_va_usdc_raw?: string | null,
    @Arg("initial_wallet_usdc_raw", () => String, { nullable: true })
    initial_wallet_usdc_raw?: string | null,
    @Arg("initial_extended_free_quantized", () => String, { nullable: true })
    initial_extended_free_quantized?: string | null,
  ): Promise<VesuExtendedUsdcSummary> {
    const sid = strategy_id.trim();
    const transfers = await prisma.vesu_extended_usdc_transfers.findMany({
      where: { strategy_id: sid },
    });

    const profile = getVesuExtendedIndexerProfiles().find(
      (p) => p.strategyId === sid,
    );

    const vaRaw = process.env.VESU_EXTENDED_VAULT_ALLOCATOR?.trim();
    const va = vaRaw
      ? standariseAddress(vaRaw)
      : profile?.va
        ? standariseAddress(profile.va)
        : "";

    const wallet = profile?.wallet ? standariseAddress(profile.wallet) : "";

    let net = 0n;
    let netWallet = 0n;
    for (const r of transfers) {
      const amt = BigInt(r.amount || "0");
      const toVa = va && standariseAddress(r.to_address) === va;
      const fromVa = va && standariseAddress(r.from_address) === va;
      if (toVa && !fromVa) net += amt;
      else if (fromVa && !toVa) net -= amt;

      const toW = wallet && standariseAddress(r.to_address) === wallet;
      const fromW = wallet && standariseAddress(r.from_address) === wallet;
      if (toW && !fromW) netWallet += amt;
      else if (fromW && !toW) netWallet -= amt;
    }

    const jsonMap = loadCapitalBaselinesByStrategy();
    const jsonRow = jsonMap?.[sid];
    const baseline = resolveCapitalBaselines(jsonRow, {
      initial_va_usdc_raw,
      initial_wallet_usdc_raw,
      initial_extended_free_quantized,
    });

    const deposits = await prisma.vesu_extended_core_deposits.findMany({
      where: { strategy_id: sid },
    });
    let sumQ = 0n;
    for (const d of deposits) {
      sumQ += BigInt(d.quantized_amount || "0");
    }

    const trades = await prisma.extended_trades.findMany({
      where: { strategy_id: sid },
    });
    let sumVal = 0n;
    let sumFee = 0n;
    for (const t of trades) {
      sumVal += decimalToMicros(t.value);
      sumFee += decimalToMicros(t.fee);
    }

    return {
      net_usdc_transfers_raw: net.toString(),
      net_wallet_usdc_transfers_raw: netWallet.toString(),
      sum_extended_deposits_quantized: sumQ.toString(),
      sum_extended_trades_value: sumVal.toString(),
      sum_extended_trades_fee: sumFee.toString(),
      baseline_va_usdc_raw: baseline.va.toString(),
      baseline_wallet_usdc_raw: baseline.wallet.toString(),
      baseline_extended_free_quantized: baseline.extendedQ.toString(),
      va_usdc_raw_estimated: (baseline.va + net).toString(),
      wallet_usdc_raw_estimated: (baseline.wallet + netWallet).toString(),
      extended_deposits_quantized_estimated: (baseline.extendedQ + sumQ).toString(),
    };
  }
}
