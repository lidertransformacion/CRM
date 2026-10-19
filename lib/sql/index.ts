import path from "node:path";
import { applySchema } from "@/lib/sql/schema-apply";
import { wrapD1 } from "@/lib/sql/d1";
import type { SqlDb } from "@/lib/sql/types";

const globalStore = globalThis as unknown as { __crmSql?: Map<string, Promise<SqlDb>>; __crmSetupReady?: boolean };

export function isSetupReady(): boolean {
  return globalStore.__crmSetupReady === true;
}

export function markSetupReady(): void {
  globalStore.__crmSetupReady = true;
}

export async function tryD1(): Promise<SqlDb | null> {
  if (process.env.VITEST) return null;
  try {
    const { env } = await import("cloudflare:workers");
    if (env.DB) return wrapD1(env.DB);
  } catch {
    return null;
  }
  return null;
}

async function openCached(key: string, open: () => Promise<SqlDb>): Promise<SqlDb> {
  if (!globalStore.__crmSql) globalStore.__crmSql = new Map();
  let pending = globalStore.__crmSql.get(key);
  if (!pending) {
    pending = (async () => {
      const db = await open();
      await applySchema(db);
      return db;
    })();
    globalStore.__crmSql.set(key, pending);
  }
  return pending;
}

export async function getSql(): Promise<SqlDb> {
  const d1 = await tryD1();
  if (d1) return openCached("d1", async () => d1);
  const file = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.sqlite");
  return openCached(`node:${file}`, async () => {
    const { openNodeSql } = await import("@/lib/sql/node");
    return openNodeSql(file);
  });
}

export function resetSqlCache() {
  globalStore.__crmSql = new Map();
  globalStore.__crmSetupReady = false;
}

export type { SqlDb } from "@/lib/sql/types";
export { isSqlDb } from "@/lib/sql/types";
