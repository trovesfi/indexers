/**
 * Sets STARTING_BLOCK to Starknet mainnet latest block_number and
 * EXTENDED_TRADES_START_TIME to Date.now() (epoch ms) in .env.
 *
 * Run from repo root: pnpm exec tsx src/standalone-scripts/update-env-mainnet-block-and-extended-time.ts
 * Uses RPC_URL from .env if set; otherwise a public mainnet JSON-RPC endpoint.
 *
 * Optional: ENV_FILE=/path/to/.env to target a file other than ./.env (cwd-relative).
 */
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { RpcProvider } from "starknet";

/** Used when RPC_URL is unset (Blast public RPC was retired). */
const DEFAULT_MAINNET_RPC = "https://starknet-rpc.publicnode.com";

function upsertEnvLine(contents: string, key: string, value: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(contents)) {
    return contents.replace(re, line);
  }
  const base = contents.replace(/\s*$/, "");
  return base.length ? `${base}\n${line}\n` : `${line}\n`;
}

async function main() {
  const envFile =
    process.env.ENV_FILE?.trim() || path.join(process.cwd(), ".env");
  dotenv.config({ path: envFile });

  const rpcUrl = process.env.RPC_URL?.trim() || DEFAULT_MAINNET_RPC;
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const block = await provider.getBlock("latest");
  const blockNumber = block.block_number;
  if (typeof blockNumber !== "number" || !Number.isFinite(blockNumber)) {
    throw new Error("getBlock(latest) returned invalid block_number");
  }

  const nowMs = Date.now();
  let raw = fs.existsSync(envFile)
    ? fs.readFileSync(envFile, "utf8")
    : "";

  if (/^EXTENDED_TRADES_START_TIME_MS=/m.test(raw)) {
    console.warn(
      "[update-env] .env defines EXTENDED_TRADES_START_TIME_MS; it overrides EXTENDED_TRADES_START_TIME in poll-extended-trades. Remove _MS if you want the new EXTENDED_TRADES_START_TIME to apply.",
    );
  }

  raw = upsertEnvLine(raw, "STARTING_BLOCK", String(blockNumber));
  raw = upsertEnvLine(raw, "EXTENDED_TRADES_START_TIME", String(nowMs));

  fs.writeFileSync(envFile, raw, "utf8");
  const rpcLabel = rpcUrl === DEFAULT_MAINNET_RPC ? "default public" : "RPC_URL";
  console.log(
    `[update-env] Wrote ${path.resolve(envFile)}: STARTING_BLOCK=${blockNumber} EXTENDED_TRADES_START_TIME=${nowMs} (rpc=${rpcLabel})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
