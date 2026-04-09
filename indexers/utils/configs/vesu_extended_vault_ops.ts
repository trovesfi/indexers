import {
  ExtendedAdapter,
  EXTENDED_CONTRACT,
  getVesuSingletonAddress,
  type IStrategyMetadata,
  VesuExtendedTestStrategies,
  VesuModifyPositionAdapter,
} from "@strkfarm/sdk";
import type { VesuExtendedStrategySettings } from "@strkfarm/sdk";
import { useDrizzleStorage } from "@apibara/plugin-drizzle";
import type { Block, Event } from "@apibara/starknet";
import { hash, uint256 } from "starknet";
import { standariseAddress } from "../../../src/utils";
import type { AdditionalField, ContractConfig, EventConfig, OnEvent } from "../config";
import * as schema from "../../drizzle/schema";

function eventKey(name: string): `0x${string}` {
  const h = BigInt(hash.getSelectorFromName(name));
  return `0x${h.toString(16).padStart(64, "0")}`;
}

type VesuExtMeta = IStrategyMetadata<VesuExtendedStrategySettings>;

/** Resolved per-strategy addresses for Vesu Extended vault ops indexing. */
export interface VesuExtendedIndexerProfile {
  strategyId: string;
  vault: string;
  va: string;
  wallet: string;
  usdc: string;
  collateral: string;
  debt: string;
  collateralDecimals: number;
  debtDecimals: number;
  /** Vesu pool contract that emits ModifyPosition (singleton for pool id). */
  poolEmitter: string;
  /** Vesu multiply contract (IncreaseLever / DecreaseLever + Ekubo locker). */
  multiplyContract: string;
  vaultIdExtended: number;
}

function readExtendedIndexerEnv() {
  return {
    extendedBackendReadUrl:
      process.env.EXTENDED_BACKEND_URL_READ?.trim() ||
      process.env.VESU_EXTENDED_READ_URL?.trim() ||
      "https://api.starknet.extended.exchange",
    extendedBackendWriteUrl:
      process.env.EXTENDED_BACKEND_URL?.trim() ||
      process.env.EXTENDED_BACKEND_WRITE_URL?.trim() ||
      "https://api.starknet.extended.exchange",
    vaultIdExtended: Number(
      process.env.VAULT_ID_EXTENDED?.trim() ||
        process.env.VESU_EXTENDED_VAULT_ID?.trim() ||
        "0",
    ),
    minimumExtendedMovementAmount: Number(
      process.env.MINIMUM_EXTENDED_AMOUNT ?? 5,
    ),
    minimumVesuMovementAmount: Number(process.env.MINIMUM_VESU_AMOUNT ?? 5),
    minimumExtendedRetriesDelayForOrderStatus: Number(
      process.env.RETRY_DELAY_FOR_ORDER_STATUS ?? 3000,
    ),
    minimumExtendedPriceDifferenceForSwapOpen: Number(
      process.env.MIN_PRICE_DIFF_SWAP_OPEN ?? 300,
    ),
    maximumExtendedPriceDifferenceForSwapClosing: Number(
      process.env.MAX_PRICE_DIFF_SWAP_CLOSE ?? 600,
    ),
  };
}

/**
 * Build metadata list from SDK (same factory as risk-engine / troves-admin).
 * Add more factories here when new Vesu Extended strategy registries exist.
 */
function loadAllVesuExtendedMetadata(): VesuExtMeta[] {
  const e = readExtendedIndexerEnv();
  const fromTestStrategies = VesuExtendedTestStrategies(
    e.extendedBackendReadUrl,
    e.extendedBackendWriteUrl,
    e.vaultIdExtended,
    e.minimumExtendedMovementAmount,
    e.minimumVesuMovementAmount,
    e.minimumExtendedRetriesDelayForOrderStatus,
    e.minimumExtendedPriceDifferenceForSwapOpen,
    e.maximumExtendedPriceDifferenceForSwapClosing,
  ).slice(1, 2); // ! only take first strategy
  return [...fromTestStrategies];
}

function extractProfile(meta: VesuExtMeta): VesuExtendedIndexerProfile | null {
  const info = meta.additionalInfo;
  const adapters = info.adapters ?? [];
  const vmpEntry = adapters.find(
    (a: any) => a.adapter.name === VesuModifyPositionAdapter.name,
  );
  const extEntry = adapters.find(
    (a: any) => a.adapter.name === ExtendedAdapter.name,
  );
  if (!vmpEntry || !extEntry) return null;

  const vmp = vmpEntry.adapter as InstanceType<typeof VesuModifyPositionAdapter>;
  const ext = extEntry.adapter as InstanceType<typeof ExtendedAdapter>;

  const { addr: poolSingleton, isV2 } = getVesuSingletonAddress(vmp.config.poolId);
  const multiplyRaw = isV2
    ? "0xd2b0006de39992e78d457b7607a606c00bd6b601e9d9a77a8e1870c5e19e73"
    : "0x3630f1f8e5b8f5c4c4ae9b6620f8a570ae55cddebc0276c37550e7c118edf67";

  return {
    strategyId: meta.id,
    vault: standariseAddress(info.vaultAddress.address),
    va: standariseAddress(info.vaultAllocator.address),
    wallet: standariseAddress(info.walletAddress),
    usdc: standariseAddress(vmp.config.debt.address.address),
    collateral: standariseAddress(vmp.config.collateral.address.address),
    debt: standariseAddress(vmp.config.debt.address.address),
    collateralDecimals: vmp.config.collateral.decimals,
    debtDecimals: vmp.config.debt.decimals,
    poolEmitter: standariseAddress(poolSingleton.address),
    multiplyContract: standariseAddress(multiplyRaw),
    vaultIdExtended: ext.config.vaultIdExtended,
  };
}

function buildProfiles(): VesuExtendedIndexerProfile[] {
  const metas = loadAllVesuExtendedMetadata();
  const out: VesuExtendedIndexerProfile[] = [];
  for (const m of metas) {
    const p = extractProfile(m);
    if (p) out.push(p);
  }
  if (out.length === 0) {
    console.warn(
      "[vesu_extended_vault_ops] No Vesu Extended profiles from SDK; check adapters on metadata.",
    );
  }
  return out;
}

const PROFILES: VesuExtendedIndexerProfile[] = buildProfiles();

const EXTENDED_CORE = standariseAddress(EXTENDED_CONTRACT.address);

/** Ekubo core (mainnet). */
const EKUBO_CORE = standariseAddress(
  "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b",
);

const LEVER_INCREASE_SEL = eventKey("IncreaseLever");
const LEVER_DECREASE_SEL = eventKey("DecreaseLever");
const SWAPPED_SEL = eventKey("Swapped");
const MODIFY_POSITION_SEL = eventKey("ModifyPosition");

function i129FromMagSign(mag: bigint, signFelt: bigint): bigint {
  const neg = signFelt !== 0n && mag !== 0n;
  return neg ? -mag : mag;
}

function feltToCanonAddress(f: bigint): string {
  return standariseAddress(`0x${f.toString(16).padStart(64, "0")}`);
}

/**
 * Decode Ekubo core `Swapped` event `data` felts (see EkuboProtocol/starknet-contracts `core.cairo`).
 * Layout: locker, PoolKey (5), SwapParameters (amount i129 + is_token1 + sqrt_limit u256 + skip), Delta (2× i129), sqrt_after u256, tick_after i129, liquidity_after u128.
 */
export function parseEkuboSwappedFelts(
  data: readonly { toString(): string }[],
): Record<string, string> | null {
  if (data.length < 21) return null;
  const d = data.map((x) => BigInt(x.toString()));
  let i = 0;
  const locker = feltToCanonAddress(d[i++]);
  const token0 = feltToCanonAddress(d[i++]);
  const token1 = feltToCanonAddress(d[i++]);
  const fee = d[i++].toString();
  const tick_spacing = d[i++].toString();
  const extension = feltToCanonAddress(d[i++]);
  const swapMag = d[i++];
  const swapSign = d[i++];
  const swap_amount_signed = i129FromMagSign(swapMag, swapSign).toString();
  const is_token1 = d[i++] !== 0n ? "true" : "false";
  const sqrtLow = d[i++];
  const sqrtHigh = d[i++];
  const sqrt_ratio_limit = (sqrtLow + (sqrtHigh << 128n)).toString();
  const skip_ahead = d[i++].toString();
  const d0mag = d[i++];
  const d0sign = d[i++];
  const delta0_signed = i129FromMagSign(d0mag, d0sign).toString();
  const d1mag = d[i++];
  const d1sign = d[i++];
  const delta1_signed = i129FromMagSign(d1mag, d1sign).toString();
  const saLow = d[i++];
  const saHigh = d[i++];
  const sqrt_ratio_after = (saLow + (saHigh << 128n)).toString();
  const tickMag = d[i++];
  const tickSign = d[i++];
  const tick_after_signed = i129FromMagSign(tickMag, tickSign).toString();
  const liquidity_after = d[i++].toString();
  return {
    locker,
    token0,
    token1,
    fee,
    tick_spacing,
    extension,
    swap_amount_signed,
    is_token1,
    sqrt_ratio_limit,
    skip_ahead,
    delta0_signed,
    delta1_signed,
    sqrt_ratio_after,
    tick_after_signed,
    liquidity_after,
  };
}

function poolTokensMatchProfile(
  p: VesuExtendedIndexerProfile,
  token0: string,
  token1: string,
): boolean {
  const a = standariseAddress(token0);
  const b = standariseAddress(token1);
  return (
    (a === p.collateral && b === p.debt) || (a === p.debt && b === p.collateral)
  );
}

function vaultIdToFelt(vaultId: number): string {
  return `0x${BigInt(vaultId).toString(16).padStart(64, "0")}`;
}

/** DB / standariseAddress use short felts; vaultIdToFelt uses 64-char padding — compare numerically. */
function depositVaultKeyMatchesVaultId(
  canonVaultKey: string,
  vaultIdExtended: number,
): boolean {
  try {
    return BigInt(canonVaultKey) === BigInt(vaultIdExtended);
  } catch {
    return false;
  }
}

function matchProfileByVa(
  profiles: VesuExtendedIndexerProfile[],
  va: string,
): VesuExtendedIndexerProfile | undefined {
  const v = standariseAddress(va);
  return profiles.find((p) => p.va === v);
}

function matchProfileByTransfer(
  profiles: VesuExtendedIndexerProfile[],
  from: string,
  to: string,
): VesuExtendedIndexerProfile | undefined {
  const f = standariseAddress(from);
  const t = standariseAddress(to);
  return profiles.find(
    (p) =>
      (f === p.va && t === p.wallet) ||
      (f === p.wallet && t === p.va) ||
      (f === p.vault && t === p.va) ||
      (f === p.va && t === p.vault) ||
      (f === EXTENDED_CORE && t === p.wallet),
  );
}

function matchProfileByDeposit(
  profiles: VesuExtendedIndexerProfile[],
  vaultKey: string,
  va: string,
): VesuExtendedIndexerProfile | undefined {
  const vaN = standariseAddress(va);
  const vk = standariseAddress(vaultKey);
  const strict = profiles.find(
    (p) =>
      p.va === vaN &&
      depositVaultKeyMatchesVaultId(vk, p.vaultIdExtended),
  );
  if (strict) return strict;

  // Env/SDK vaultIdExtended can disagree with on-chain Deposit keys; transfers still
  // classify via VA. If only one profile uses this VA, attribute the deposit to it.
  const byVa = profiles.filter((p) => p.va === vaN);
  if (byVa.length === 1) return byVa[0];

  return undefined;
}

function makeUsdcTransferOnEvent(
  profiles: VesuExtendedIndexerProfile[],
): OnEvent {
  return async (_event, record) => {
    const from = standariseAddress(String(record.from_address ?? ""));
    const to = standariseAddress(String(record.to_address ?? ""));
    const p = matchProfileByTransfer(profiles, from, to);

    record.strategy_id = p?.strategyId ?? "unknown";

    if (!p) {
      record.flow_type = "other";
      return;
    }

    let flow_type = "other";
    if (from === p.va && to === p.wallet) flow_type = "va_to_wallet";
    else if (from === p.wallet && to === p.va) flow_type = "wallet_to_va";
    else if (from === p.vault && to === p.va) flow_type = "vault_to_va";
    else if (from === p.va && to === p.vault) flow_type = "va_to_vault";
    else if (from === EXTENDED_CORE && to === p.wallet) {
      flow_type = "extended_withdrawal";
    }
    record.flow_type = flow_type;
  };
}

function txEventOrder(e: Event): number {
  return e.eventIndexInTransaction ?? e.eventIndex ?? 0;
}

function isPoolModifyPosition(e: Event, poolContract: string): boolean {
  if (standariseAddress(e.address) !== standariseAddress(poolContract))
    return false;
  if (!e.keys?.length) return false;
  return BigInt(e.keys[0]) === BigInt(MODIFY_POSITION_SEL);
}

function readPairU256(
  data: readonly unknown[],
  offset: number,
): { value: string; next: number } {
  const low = data[offset] as any;
  const high = data[offset + 1] as any;
  return {
    value: uint256.uint256ToBN({ low, high }).toString(),
    next: offset + 2,
  };
}

/** Parse multiply Increase/Decrease lever event (caller decides tx ordering). */
function tryMultiplyLeverInsert(
  e: Event,
  block: Block,
  profile: VesuExtendedIndexerProfile,
): typeof schema.vesu_extended_multiply_lever.$inferInsert | null {
  if (standariseAddress(e.address) !== profile.multiplyContract) return null;
  if (e.keys.length < 5 || e.data.length < 6) return null;

  const sel = BigInt(e.keys[0]);
  const inc = BigInt(LEVER_INCREASE_SEL);
  const dec = BigInt(LEVER_DECREASE_SEL);
  if (sel !== inc && sel !== dec) return null;

  const pool_id = feltToCanonAddress(BigInt(String(e.keys[1])));
  const collateral_asset = feltToCanonAddress(BigInt(String(e.keys[2])));
  const debt_asset = feltToCanonAddress(BigInt(String(e.keys[3])));
  const user_address = feltToCanonAddress(BigInt(String(e.keys[4])));

  if (
    user_address !== profile.va ||
    collateral_asset !== profile.collateral ||
    debt_asset !== profile.debt
  ) {
    return null;
  }

  const m0 = readPairU256(e.data, 0);
  const m1 = readPairU256(e.data, m0.next);
  const m2 = readPairU256(e.data, m1.next);

  const header = block.header;
  if (!header?.blockNumber || !header.timestamp) return null;
  const ts = Math.round(header.timestamp.getTime() / 1000);
  const bn = Number(header.blockNumber);

  return {
    block_number: bn,
    tx_index: e.transactionIndex,
    event_index: e.eventIndex ?? 0,
    tx_hash: e.transactionHash,
    strategy_id: profile.strategyId,
    lever_kind: sel === inc ? "increase" : "decrease",
    pool_id,
    collateral_asset,
    debt_asset,
    user_address,
    margin: m0.value,
    collateral_delta: m1.value,
    debt_delta: m2.value,
    timestamp: ts,
    cursor: BigInt(bn),
  };
}

/** Parse Ekubo Swapped (caller restricts tx window; locker = multiply; pool = strategy tokens). */
function tryEkuboSwappedInsert(
  e: Event,
  block: Block,
  profile: VesuExtendedIndexerProfile,
): typeof schema.vesu_extended_ekubo_swapped.$inferInsert | null {
  if (standariseAddress(e.address) !== EKUBO_CORE) return null;
  if (BigInt(e.keys[0]) !== BigInt(SWAPPED_SEL)) return null;

  const parsed = parseEkuboSwappedFelts(e.data);
  if (!parsed) return null;
  if (standariseAddress(parsed.locker) !== profile.multiplyContract)
    return null;
  if (!poolTokensMatchProfile(profile, parsed.token0, parsed.token1))
    return null;

  const header = block.header;
  if (!header?.blockNumber || !header.timestamp) return null;
  const ts = Math.round(header.timestamp.getTime() / 1000);
  const bn = Number(header.blockNumber);

  return {
    block_number: bn,
    tx_index: e.transactionIndex,
    event_index: e.eventIndex ?? 0,
    tx_hash: e.transactionHash,
    strategy_id: profile.strategyId,
    timestamp: ts,
    cursor: BigInt(bn),
    locker: parsed.locker,
    token0: parsed.token0,
    token1: parsed.token1,
    fee: parsed.fee,
    tick_spacing: parsed.tick_spacing,
    extension: parsed.extension,
    swap_amount_signed: parsed.swap_amount_signed,
    is_token1: parsed.is_token1,
    sqrt_ratio_limit: parsed.sqrt_ratio_limit,
    skip_ahead: parsed.skip_ahead,
    delta0_signed: parsed.delta0_signed,
    delta1_signed: parsed.delta1_signed,
    sqrt_ratio_after: parsed.sqrt_ratio_after,
    tick_after_signed: parsed.tick_after_signed,
    liquidity_after: parsed.liquidity_after,
  };
}

function makeModifyOnEvent(profiles: VesuExtendedIndexerProfile[]): OnEvent {
  return async (event, record, allEvents, block) => {
    const ua = standariseAddress(String(record.user_address ?? ""));
    const p = matchProfileByVa(profiles, ua);
    record.strategy_id = p?.strategyId ?? "unknown";

    if (!p || !allEvents?.length || !block?.header?.blockNumber) return;

    const modifyOrder = txEventOrder(event);
    const txHash = event.transactionHash;
    const poolContract = standariseAddress(event.address);
    const sibs = allEvents.filter((e) => e.transactionHash === txHash);
    const ordered = [...sibs].sort((a, b) => txEventOrder(a) - txEventOrder(b));

    const prevModifyOrder = ordered
      .filter(
        (e) =>
          isPoolModifyPosition(e, poolContract) &&
          txEventOrder(e) < modifyOrder,
      )
      .reduce((max, e) => Math.max(max, txEventOrder(e)), -1);

    const { db } = useDrizzleStorage();

    for (const e of ordered) {
      const o = txEventOrder(e);
      if (o <= prevModifyOrder || o >= modifyOrder) continue;
      if (isPoolModifyPosition(e, poolContract)) continue;

      const swapRow = tryEkuboSwappedInsert(e, block, p);
      if (swapRow) {
        await db
          .insert(schema.vesu_extended_ekubo_swapped)
          .values(swapRow)
          .onConflictDoNothing({
            target: [
              schema.vesu_extended_ekubo_swapped.block_number,
              schema.vesu_extended_ekubo_swapped.tx_index,
              schema.vesu_extended_ekubo_swapped.event_index,
            ],
          })
          .execute();
      }
    }

    for (const e of ordered) {
      const o = txEventOrder(e);
      if (o <= modifyOrder) continue;
      if (isPoolModifyPosition(e, poolContract)) break;

      const leverRow = tryMultiplyLeverInsert(e, block, p);
      if (leverRow) {
        await db
          .insert(schema.vesu_extended_multiply_lever)
          .values(leverRow)
          .onConflictDoNothing({
            target: [
              schema.vesu_extended_multiply_lever.block_number,
              schema.vesu_extended_multiply_lever.tx_index,
              schema.vesu_extended_multiply_lever.event_index,
            ],
          })
          .execute();
        break;
      }
    }
  };
}

function makeDepositOnEvent(profiles: VesuExtendedIndexerProfile[]): OnEvent {
  return async (_event, record) => {
    const vk = standariseAddress(String(record.vault_id_key ?? ""));
    const va = standariseAddress(String(record.va_address ?? ""));
    const p = matchProfileByDeposit(profiles, vk, va);
    record.strategy_id = p?.strategyId ?? "unknown";
  };
}

const strategyIdPlaceholder: AdditionalField[] = [
  {
    name: "strategy_id",
    source: "custom",
    sqlType: "text",
    customLogic: () => "",
  },
  {
    name: "flow_type",
    source: "custom",
    sqlType: "text",
    customLogic: () => "",
  },
];

/** One config per debt (USDC) token so strategies can use different ERC20s. */
function buildUsdcTransferConfigs(
  profiles: VesuExtendedIndexerProfile[],
): EventConfig[] {
  if (profiles.length === 0) return [];

  const byUsdc = new Map<string, VesuExtendedIndexerProfile[]>();
  for (const p of profiles) {
    const list = byUsdc.get(p.usdc) ?? [];
    list.push(p);
    byUsdc.set(p.usdc, list);
  }

  const out: EventConfig[] = [];
  const transferSel = eventKey("Transfer");

  for (const [usdc, plist] of byUsdc) {
    const defaultKeys: `0x${string}`[][] = [];
    for (const p of plist) {
      defaultKeys.push(
        [transferSel, p.va as `0x${string}`, p.wallet as `0x${string}`],
        [transferSel, p.wallet as `0x${string}`, p.va as `0x${string}`],
        [transferSel, p.vault as `0x${string}`, p.va as `0x${string}`],
        [transferSel, p.va as `0x${string}`, p.vault as `0x${string}`],
        [
          transferSel,
          EXTENDED_CORE as `0x${string}`,
          p.wallet as `0x${string}`,
        ],
      );
    }
    out.push({
      tableName: "vesu_extended_usdc_transfers",
      contracts: [{ address: usdc, asset: usdc, name: "USDC" }],
      defaultKeys,
      keyFields: [
        { name: "from_address", type: "ContractAddress", sqlType: "text" },
        { name: "to_address", type: "ContractAddress", sqlType: "text" },
      ],
      dataFields: [{ name: "amount", type: "u256", sqlType: "numeric(78,0)" }],
      additionalFields: [...strategyIdPlaceholder],
      onEvent: makeUsdcTransferOnEvent(plist),
    });
  }
  return out;
}

function buildModifyPositionConfig(
  profiles: VesuExtendedIndexerProfile[],
): EventConfig | null {
  if (profiles.length === 0) return null;

  const sel = eventKey("ModifyPosition");
  const poolSet = new Map<string, VesuExtendedIndexerProfile[]>();
  for (const p of profiles) {
    const list = poolSet.get(p.poolEmitter) ?? [];
    list.push(p);
    poolSet.set(p.poolEmitter, list);
  }

  const contracts: ContractConfig[] = [...poolSet.keys()].map((address) => ({
    address,
    asset: "",
    name: "vesu_pool",
  }));

  const defaultKeys: `0x${string}`[][] = [];
  for (const p of profiles) {
    defaultKeys.push([
      sel,
      p.collateral as `0x${string}`,
      p.debt as `0x${string}`,
      p.va as `0x${string}`,
    ]);
  }

  return {
    tableName: "vesu_extended_modify_position",
    contracts,
    defaultKeys,
    keyFields: [
      { name: "collateral_asset", type: "ContractAddress", sqlType: "text" },
      { name: "debt_asset", type: "ContractAddress", sqlType: "text" },
      { name: "user_address", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "collateral_delta", type: "i257", sqlType: "numeric(78,0)" },
      { name: "collateral_shares_delta", type: "i257", sqlType: "numeric(78,0)" },
      { name: "debt_delta", type: "i257", sqlType: "numeric(78,0)" },
      { name: "nominal_debt_delta", type: "i257", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "strategy_id",
        source: "custom",
        sqlType: "text",
        customLogic: () => "",
      },
      {
        name: "pool_contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => standariseAddress(event.address),
      },
    ],
    includeReceipt: true,
    onEvent: makeModifyOnEvent(profiles),
  };
}

function buildExtendedDepositConfig(
  profiles: VesuExtendedIndexerProfile[],
): EventConfig | null {
  const withVault = profiles.filter((p) => p.vaultIdExtended > 0);
  if (withVault.length === 0) return null;

  const depositSel = eventKey("Deposit");
  const defaultKeys: `0x${string}`[][] = [];
  for (const p of withVault) {
    defaultKeys.push([
      depositSel,
      vaultIdToFelt(p.vaultIdExtended) as `0x${string}`,
      p.va as `0x${string}`,
    ]);
  }

  return {
    tableName: "vesu_extended_core_deposits",
    contracts: [
      { address: EXTENDED_CORE, asset: "", name: "extended_core" },
    ],
    defaultKeys,
    keyFields: [
      { name: "vault_id_key", type: "ContractAddress", sqlType: "text" },
      { name: "va_address", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "collateral_id", type: "u64", sqlType: "numeric(78,0)" },
      { name: "quantized_amount", type: "u64", sqlType: "numeric(78,0)" },
      { name: "unquantized_amount", type: "u64", sqlType: "numeric(78,0)" },
      { name: "salt", type: "u64", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "strategy_id",
        source: "custom",
        sqlType: "text",
        customLogic: () => "",
      },
    ],
    onEvent: makeDepositOnEvent(withVault),
  };
}

/**
 * Vesu Extended vault ops: USDC transfers, ModifyPosition (includeReceipt → same-tx siblings;
 * onEvent indexes multiply lever + Ekubo swaps only for our VA), Extended deposit.
 * No global Ekubo / multiply filters — avoids indexing unrelated Swapped events.
 */
export const CONFIG_VESU_EXTENDED_VAULT_OPS: EventConfig[] = (() => {
  const profiles = PROFILES;
  const out: EventConfig[] = [];
  out.push(...buildUsdcTransferConfigs(profiles));
  const m = buildModifyPositionConfig(profiles);
  if (m) out.push(m);
  const d = buildExtendedDepositConfig(profiles);
  if (d) out.push(d);
  return out;
})();

/** Exposed for admin / debugging: strategy ids and addresses from SDK. */
export function getVesuExtendedIndexerProfiles(): VesuExtendedIndexerProfile[] {
  return [...PROFILES];
}
