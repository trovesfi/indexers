// import Long from "https://esm.run/long@latest";
// import { num } from 'https://esm.run/starknet@5.29.0';
import { num } from "starknet";

export function toHex(el: string | null | undefined) {
  if (!el) return "0x0";
  return standariseAddress(el);
}

export function toBigInt(
  el: number | { toString: () => string } | null | undefined
) {
  if (!el || el === 0) return BigInt(0);
  return BigInt(el.toString());
}

export function toNumber(
  el: number | { toString: () => string } | null | undefined
) {
  if (!el) return 0;
  return Number(el.toString());
}

export function standariseAddress(address: string | bigint) {
  let _a = address;
  if (!address) {
    _a = "0";
  }
  const a = num.getHexString(num.getDecimalString(_a.toString()));
  return a;
}

export function validateEnv() {
  const requiredEnvs = [
    "DNA_AUTH_TOKEN",
    "POSTGRES_CONNECTION_STRING",
    "START_BLOCK",
  ];

  for (const env of requiredEnvs) {
    if (!process.env[env]) throw new Error(`Env variable requird: ${env}`);
  }
}
