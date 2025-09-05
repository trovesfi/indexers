import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { num } from "starknet";

import * as schema from "../drizzle/schema";

export function getDB(connectionString: string) {
  const pool = new pg.Pool({
    connectionString: connectionString,
  });
  return drizzle(pool, { schema });
}

export function standardise(address: string | bigint) {
  let _a = address;
  if (!address) {
    _a = "0";
  }
  const a = num.getHexString(num.getDecimalString(_a.toString()));
  return a;
}

export function toHex(el: string | null | undefined) {
  if (!el) return "0x0";
  return standariseAddress(el);
}

export function toBigInt(
  el: number | { toString: () => string } | null | undefined
) {
  if (!el) return BigInt(0);
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

export interface ContractSaltMapping {
  [contractAddress: string]: string[];
}

export const CONTRACT_SALT_MAPPING: ContractSaltMapping = {
  "0x2e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067": [
    "1269084",
  ],
};

export function isSaltForContract(contract: string, salt: string): boolean {
  const standardizedContract = standariseAddress(contract);
  const salts = CONTRACT_SALT_MAPPING[standardizedContract];
  return salts ? salts.includes(salt) : false;
}

export function getSaltsForContract(contract: string): string[] {
  const standardizedContract = standariseAddress(contract);
  return CONTRACT_SALT_MAPPING[standardizedContract] || [];
}

export function getContractsForSalt(salt: string): string[] {
  return Object.entries(CONTRACT_SALT_MAPPING)
    .filter(([_, salts]) => salts.includes(salt))
    .map(([contract]) => contract);
}
