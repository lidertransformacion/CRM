import { AsyncLocalStorage } from "node:async_hooks";

/**
 * SQLite stand-in for D1 `meta.rows_read`.
 *
 * D1 counts rows the engine examines (a full scan of N rows is about N, an
 * indexed lookup is about the rows returned). This counter uses the same rule:
 * an indexed equality or IN probe costs the rows returned (at least 1 for the
 * probe); anything else costs the cardinality of each table it scans, once per
 * FROM/JOIN mention. Writes that are not scans cost 0.
 */

type Scope = { total: number };

const storage = new AsyncLocalStorage<Scope>();

const PRIMARY: Record<string, string[]> = {
  committee_docs: ["id"],
  stages: ["name"],
  teams: ["name"],
  team_members: ["team_name"],
  leads: ["import_key"],
  activities: ["id"],
  lead_edits: ["import_key"],
  equipment: ["serial"],
  equipment_history: ["id"],
  maintenance_logs: ["id"],
  suppliers: ["name"],
  catalogs: ["kind"],
  app_settings: ["key"],
  kpi_targets: ["id"],
  email_templates: ["id"],
  users: ["id"],
  user_events: ["id"],
  email_outbox: ["id"],
  gmail_tokens: ["user_id"],
  odoo_outbound: ["id"],
  odoo_snapshot_seen: ["snapshot_id"],
  odoo_sync_log: ["id"],
  visit_points: ["id"],
  visits: ["id"],
  visit_photos: ["id"],
  mail_favorites: ["id"],
  committee_email_log: ["id"],
  mail_files: ["id"],
  folders: ["id"],
  files: ["id"],
  contracts: ["id"],
  contract_links: ["id"],
  contract_novedades: ["id"],
  contract_signers: ["id"],
  signature_requests: ["id"],
  signature_steps: ["id"],
  signature_agreements: ["user_id"],
  audit_events: ["id"],
  notifications: ["id"],
  storage_usage: ["id"],
  read_epoch: ["id"],
  read_snapshots: ["cache_key"],
  kpi_period_facts: ["period"],
};

const UNIQUE: Record<string, string[]> = {
  users: ["email"],
  equipment: ["asset_number", "internal_id", "sheet_serial"],
  contracts: ["code"],
  signature_requests: ["public_id"],
  files: ["r2_key"],
  email_outbox: ["dedupe_key"],
  gmail_tokens: ["user_id"],
};

export type RowPlan = {
  cardinality(table: string): number;
  indexed(table: string, column: string): boolean;
};

export function addRowsRead(count: number) {
  if (!Number.isFinite(count) || count <= 0) return;
  const scope = storage.getStore();
  if (!scope) return;
  scope.total += count;
}

export async function measureRows<T>(fn: () => Promise<T>): Promise<{ value: T; rowsRead: number }> {
  return storage.run({ total: 0 }, async () => {
    const value = await fn();
    return { value, rowsRead: storage.getStore()?.total ?? 0 };
  });
}

export function rowsReadNow(): number {
  return storage.getStore()?.total ?? 0;
}

function normalized(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
}

function mentionedTables(sql: string): string[] {
  const names: string[] = [];
  const re = /\b(?:from|join|update|into)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  for (const match of sql.matchAll(re)) {
    const name = match[1].toLowerCase();
    if (name === "select" || name.startsWith("sqlite_")) continue;
    names.push(name);
  }
  return names;
}

function whereBody(sql: string): string {
  const match = /\bwhere\b([\s\S]*?)(?:\bgroup\b|\border\b|\blimit\b|\bunion\b|$)/i.exec(sql);
  return match?.[1] ?? "";
}

function predicateColumns(where: string): string[] {
  const cols: string[] = [];
  const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|in\s*\()/gi;
  for (const match of where.matchAll(re)) {
    const name = match[1].toLowerCase();
    if (["and", "or", "not", "null", "is", "in", "on", "as"].includes(name)) continue;
    cols.push(name);
  }
  return cols;
}

function columnIndexed(table: string, column: string, plan: RowPlan): boolean {
  if (PRIMARY[table]?.[0] === column) return true;
  if (UNIQUE[table]?.includes(column)) return true;
  return plan.indexed(table, column);
}

/** True when every scanned table has an equality/IN predicate the planner can probe. */
export function indexedLookup(sql: string, tables: string[], plan: RowPlan): boolean {
  if (!tables.length) return false;
  const where = whereBody(sql);
  if (!where.trim()) return false;
  if (/\blike\b/i.test(where)) return false;
  if (/\b(?:lower|upper|substr|date|coalesce|ifnull)\s*\(/i.test(where)) return false;
  const cols = predicateColumns(where);
  if (!cols.length) return false;
  const uniqueTables = [...new Set(tables)];
  if (/\bor\b/i.test(where)) {
    return uniqueTables.length === 1 && cols.every((column) => columnIndexed(uniqueTables[0], column, plan));
  }
  return uniqueTables.every((table) => cols.some((column) => columnIndexed(table, column, plan)));
}

export function estimateRowsRead(sql: string, returned: number, plan: RowPlan): number {
  const text = normalized(sql);
  if (!text) return 0;
  if (/^(begin|commit|rollback|pragma|create|alter|drop|insert|replace)\b/i.test(text)) return 0;
  const reading = /^(select|with|update|delete)\b/i.test(text);
  if (!reading) return 0;
  const tables = mentionedTables(text);
  if (!tables.length) return Math.max(returned, 0);
  if (indexedLookup(text, tables, plan)) return Math.max(returned, 1);
  let scanned = 0;
  for (const table of tables) scanned += plan.cardinality(table);
  return Math.max(scanned, returned);
}

/** Leftmost columns of secondary indexes, parsed from sqlite_master SQL. */
export function indexColumns(createSql: string | null | undefined): string[] {
  if (!createSql) return [];
  const match = /\bon\s+[a-zA-Z0-9_]+\s*\(([^)]*)\)/i.exec(createSql);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0]?.replace(/["`[\]]/g, "").toLowerCase() ?? "")
    .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
}
