/**
 * Polls extended-server GET /api/v1/trades and upserts into extended_trades.
 * Run with EXTENDED_BACKEND_URL_READ, optional INDEXER_API_KEY (matches server X-API-Key if set).
 * Uses VESU_EXTENDED_STRATEGY_ID (default extended_usdc_test — matches VesuExtendedTestStrategies meta.id). Poll every 30s by default.
 * Optional EXTENDED_TRADES_START_TIME: trades with createdTime before this are not saved (ISO-8601, unix seconds, or unix ms).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const POLL_MS = Number(process.env.EXTENDED_TRADES_POLL_MS ?? 30_000);
const LIMIT = Number(process.env.EXTENDED_TRADES_LIMIT ?? 50);
/** Set to "1" to page backward with pagination.cursor (historical backfill). Default: always fetch latest page. */
const USE_CURSOR = process.env.EXTENDED_TRADES_USE_CURSOR === "1";
const POLL_STATE_ID = "default";
const STRATEGY_ID =
  process.env.VESU_EXTENDED_STRATEGY_ID?.trim() || "extended_usdc_test_1";

/**
 * Cutoff in epoch milliseconds (same unit as Extended trade createdTime).
 * Unset = persist all trades returned by the API.
 */
function parseExtendedTradesStartTimeMs(): number | null {
  const raw =
    process.env.EXTENDED_TRADES_START_TIME_MS?.trim() ||
    process.env.EXTENDED_TRADES_START_TIME?.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.includes("T")) {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Heuristic: unix seconds are ~1e9–1e10; ms since 2001 are ~1e12+
  if (n > 0 && n < 1e12) return Math.trunc(n * 1000);
  return Math.trunc(n);
}

const TRADES_START_TIME_MS = parseExtendedTradesStartTimeMs();

type TradeRow = {
  id: string;
  accountId: string;
  market: string;
  orderId: string;
  externalId?: string;
  side: string;
  price: string;
  qty: string;
  value: string;
  fee: string;
  tradeType: string;
  createdTime: number;
  isTaker: boolean;
};

type TradesResponse = {
  status: string;
  data?: TradeRow[];
  pagination?: { cursor?: number; count?: number };
};

/** JSON.parse loses precision for uint64 ids; quote id / orderId before parse. */
function parseTradesJson(text: string): TradesResponse {
  const patched = text
    .replace(/"id"\s*:\s*(\d+)(?=\s*[,}])/g, '"id":"$1"')
    .replace(/"orderId"\s*:\s*(\d+)(?=\s*[,}])/g, '"orderId":"$1"')
    .replace(
      /"accountId"\s*:\s*(\d+)(?=\s*[,}])/g,
      '"accountId":"$1"',
    );
  return JSON.parse(patched) as TradesResponse;
}

async function fetchTrades(cursor?: number): Promise<TradesResponse> {
  const base = process.env.EXTENDED_BACKEND_URL_READ?.replace(/\/$/, "");
  if (!base) {
    throw new Error("EXTENDED_BACKEND_URL_READ is required");
  }
  const url = new URL(`${base}/api/v1/trades`);
  url.searchParams.set("limit", String(LIMIT));
  if (cursor != null) url.searchParams.set("cursor", String(cursor));

  const headers: Record<string, string> = {
    "User-Agent": "strkfarm-indexers-poll/1.0",
  };
  const apiKey =
    process.env.INDEXER_API_KEY?.trim() ||
    process.env.EXTENDED_SERVER_API_KEY?.trim();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    headers["X-Api-Key"] = apiKey;
  }

  const res = await fetch(url.toString(), { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`trades HTTP ${res.status}: ${text}`);
  }
  return parseTradesJson(text);
}

function normalizeTrade(row: Record<string, unknown>): TradeRow {
  const r = row as Record<string, any>;
  return {
    id: String(r.id),
    accountId: String(r.accountId ?? r.account_id ?? ""),
    market: String(r.market ?? ""),
    orderId: String(r.orderId ?? r.order_id ?? ""),
    externalId: r.externalId ?? r.external_id,
    side: String(r.side ?? ""),
    price: String(r.price ?? ""),
    qty: String(r.qty ?? ""),
    value: String(r.value ?? ""),
    fee: String(r.fee ?? ""),
    tradeType: String(r.tradeType ?? r.trade_type ?? ""),
    createdTime: Number(r.createdTime ?? r.created_time ?? 0),
    isTaker: Boolean(r.isTaker ?? r.is_taker),
  };
}

async function upsertTrades(rows: TradeRow[]): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const t of rows) {
    await prisma.extended_trades.upsert({
      where: { trade_id: t.id },
      create: {
        trade_id: t.id,
        strategy_id: STRATEGY_ID,
        account_id: t.accountId,
        market: t.market,
        order_id: t.orderId,
        external_id: t.externalId ?? null,
        side: t.side,
        price: String(t.price),
        qty: String(t.qty),
        value: String(t.value),
        fee: String(t.fee),
        trade_type: t.tradeType,
        created_time: String(t.createdTime),
        is_taker: t.isTaker,
        synced_at: now,
      },
      update: {
        market: t.market,
        order_id: t.orderId,
        external_id: t.externalId ?? null,
        side: t.side,
        price: String(t.price),
        qty: String(t.qty),
        value: String(t.value),
        fee: String(t.fee),
        trade_type: t.tradeType,
        created_time: String(t.createdTime),
        is_taker: t.isTaker,
        synced_at: now,
      },
    });
  }
}

async function pollOnce(): Promise<void> {
  let cursor: number | undefined;
  if (USE_CURSOR) {
    const state = await prisma.extended_trades_poll_state.findUnique({
      where: { id: POLL_STATE_ID },
    });
    cursor = state?.last_cursor ? Number(state.last_cursor) : undefined;
  }

  const body = await fetchTrades(cursor);
  if (body.status !== "OK" && body.status !== "ok") {
    console.warn("[trades] non-OK status:", body);
  }
  const data = body.data ?? [];
  if (data.length) {
    const normalized = data.map(normalizeTrade);
    const toSave =
      TRADES_START_TIME_MS == null
        ? normalized
        : normalized.filter((t) => t.createdTime >= TRADES_START_TIME_MS);
    const skipped = normalized.length - toSave.length;
    if (skipped > 0 && TRADES_START_TIME_MS != null) {
      console.log(
        `[trades] skipped ${skipped} trade(s) before start cutoff (${new Date(TRADES_START_TIME_MS).toISOString()})`,
      );
    }
    if (toSave.length) {
      await upsertTrades(toSave);
      console.log(`[trades] upserted ${toSave.length} rows`);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  if (USE_CURSOR) {
    const next = body.pagination?.cursor;
    const state = await prisma.extended_trades_poll_state.findUnique({
      where: { id: POLL_STATE_ID },
    });
    await prisma.extended_trades_poll_state.upsert({
      where: { id: POLL_STATE_ID },
      create: {
        id: POLL_STATE_ID,
        last_cursor: next != null ? String(next) : null,
        updated_at: now,
      },
      update: {
        last_cursor: next != null ? String(next) : state?.last_cursor ?? null,
        updated_at: now,
      },
    });
  }
}

async function main(): Promise<void> {
  console.log(
    `[trades] polling ${process.env.EXTENDED_BACKEND_URL_READ} every ${POLL_MS}ms`,
  );
  if (TRADES_START_TIME_MS != null) {
    console.log(
      `[trades] start cutoff: only saving trades with createdTime >= ${TRADES_START_TIME_MS} (${new Date(TRADES_START_TIME_MS).toISOString()})`,
    );
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[trades] poll error:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
