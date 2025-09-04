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