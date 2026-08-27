import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DB_PATH ?? "./data/drillbook.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
// `next build` collects page data with parallel workers that all module-init
// this file against the build-placeholder DB; the WAL pragma needs an
// exclusive lock and can throw SQLITE_BUSY in that race. Harmless there —
// the single runtime process always wins it.
try {
  sqlite.pragma("journal_mode = WAL");
} catch (e) {
  console.warn("[db] WAL pragma skipped:", e);
}
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
