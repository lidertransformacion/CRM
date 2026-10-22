import type { SqlDb } from "@/lib/sql/types";

/**
 * Read cache for data that should not be re-aggregated on every screen.
 * A domain epoch bumps inside the write that changed the table. Reads reuse
 * memory when the epoch matches, or one stored row after a cold start.
 * Client filters never come through here: they run on the payload already loaded.
 */

export type Domain =
  | "leads"
  | "activities"
  | "equipment"
  | "maintenance"
  | "catalogs"
  | "committee"
  | "settings"
  | "targets"
  | "visits"
  | "legal"
  | "mail"
  | "users";

const TABLE_DOMAIN: Record<string, Domain> = {
  leads: "leads",
  lead_edits: "leads",
  teams: "leads",
  team_members: "leads",
  stages: "leads",
  activities: "activities",
  equipment: "equipment",
  equipment_history: "equipment",
  suppliers: "equipment",
  odoo_outbound: "leads",
  maintenance_logs: "maintenance",
  catalogs: "catalogs",
  committee_docs: "committee",
  app_settings: "settings",
  kpi_targets: "targets",
  visit_points: "visits",
  visits: "visits",
  visit_photos: "visits",
  contracts: "legal",
  contract_links: "legal",
  contract_novedades: "legal",
  contract_signers: "legal",
  signature_requests: "legal",
  signature_steps: "legal",
  signature_agreements: "legal",
  audit_events: "legal",
  files: "legal",
  folders: "legal",
  notifications: "legal",
  email_templates: "mail",
  email_outbox: "mail",
  mail_favorites: "mail",
  mail_files: "mail",
  committee_email_log: "mail",
  users: "users",
  user_events: "users",
  gmail_tokens: "users",
};

const SNAPSHOT_LIMIT = 1_800_000;

type Tx = { depth: number; dirty: Set<Domain> };

type MemoryEntry = { token: string; changes: number | null; value: unknown };

type SnapshotHooks = {
  restore?: (token: string) => Promise<unknown | undefined>;
  persist?: (token: string, value: unknown) => Promise<void>;
};

const links = new WeakMap<SqlDb, object>();
const changeReaders = new WeakMap<object, () => number>();
const txByConn = new WeakMap<object, Tx>();
const epochMemory = new Map<string, Record<string, number>>();
const memory = new Map<string, MemoryEntry>();
const cacheChanges = new WeakMap<object, number>();
const connIds = new WeakMap<object, number>();
let nextConn = 1;
let settling = 0;

export function bindConnection(db: SqlDb, conn: object) {
  links.set(db, conn);
}

export function connectionOf(db: SqlDb): object {
  return links.get(db) ?? (db as object);
}

export function bindChanges(conn: object, read: () => number) {
  changeReaders.set(conn, read);
}

export function isSettling(): boolean {
  return settling > 0;
}

function connKey(conn: object): string {
  let id = connIds.get(conn);
  if (!id) {
    id = nextConn;
    nextConn += 1;
    connIds.set(conn, id);
  }
  return String(id);
}

function stateOf(conn: object): Tx {
  let state = txByConn.get(conn);
  if (!state) {
    state = { depth: 0, dirty: new Set() };
    txByConn.set(conn, state);
  }
  return state;
}

export function transactionDepth(conn: object): number {
  return txByConn.get(conn)?.depth ?? 0;
}

function rememberTable(state: Tx, table: string) {
  const domain = TABLE_DOMAIN[table.toLowerCase()];
  if (domain) state.dirty.add(domain);
}

/** Records inserts, updates, and deletes. BEGIN/COMMIT only move the transaction depth. */
export function noteWrite(conn: object, sql: string) {
  const state = stateOf(conn);
  const text = sql.trim();
  if (/^BEGIN\b/i.test(text)) {
    state.depth += 1;
    return;
  }
  if (/^COMMIT\b/i.test(text)) {
    state.depth = Math.max(0, state.depth - 1);
    return;
  }
  if (/^ROLLBACK\b/i.test(text)) {
    state.depth = Math.max(0, state.depth - 1);
    state.dirty.clear();
    return;
  }
  for (const part of text.split(";")) {
    const statement = part.trim();
    if (!statement) continue;
    if (/^BEGIN\b/i.test(statement)) state.depth += 1;
    else if (/^COMMIT\b/i.test(statement)) state.depth = Math.max(0, state.depth - 1);
    else if (/^ROLLBACK\b/i.test(statement)) {
      state.depth = Math.max(0, state.depth - 1);
      state.dirty.clear();
    } else {
      for (const match of statement.matchAll(/\b(?:insert\s+into|replace\s+into|update|delete\s+from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
        rememberTable(state, match[1]);
      }
    }
  }
}

function rawTotal(conn: object): number | null {
  const read = changeReaders.get(conn);
  if (!read) return null;
  try {
    return read();
  } catch {
    return null;
  }
}

/** Snapshot and epoch writes must not look like table changes to the other caches. */
function absorbCacheChanges(conn: object, before: number | null) {
  const after = rawTotal(conn);
  if (before == null || after == null || after <= before) return;
  cacheChanges.set(conn, (cacheChanges.get(conn) ?? 0) + (after - before));
}

function changesOf(conn: object): number | null {
  const raw = rawTotal(conn);
  if (raw == null) return null;
  return raw - (cacheChanges.get(conn) ?? 0);
}

function dropMemory(conn: object) {
  const prefix = `${connKey(conn)}\0`;
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
}

/** Bumps domain epochs. Inside a transaction pass force so the bump commits with the write. */
export async function settleWrites(db: SqlDb, force = false): Promise<void> {
  const conn = connectionOf(db);
  const state = stateOf(conn);
  if (settling) return;
  if (state.depth > 0 && !force) return;
  if (!state.dirty.size) return;
  const domains = [...state.dirty];
  state.dirty.clear();
  settling += 1;
  try {
    const id = connKey(conn);
    const current = epochMemory.get(id) ?? (await readEpoch(db));
    for (const domain of domains) current[domain] = (current[domain] ?? 0) + 1;
    epochMemory.set(id, current);
    const before = rawTotal(conn);
    await db.run("INSERT INTO read_epoch (id, domains) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET domains = excluded.domains", [
      JSON.stringify(current),
    ]);
    absorbCacheChanges(conn, before);
    dropMemory(conn);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/no such table/i.test(message)) throw error;
  } finally {
    settling -= 1;
  }
}

async function readEpoch(db: SqlDb): Promise<Record<string, number>> {
  const row = await db.get<{ domains: string }>("SELECT domains FROM read_epoch WHERE id = 1");
  if (!row?.domains) return {};
  try {
    const parsed = JSON.parse(row.domains) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function epochToken(db: SqlDb, conn: object, domains: Domain[]): Promise<string> {
  const id = connKey(conn);
  const known = epochMemory.get(id);
  const map = known ?? (await readEpoch(db));
  if (!known) epochMemory.set(id, map);
  return domains.map((domain) => `${domain}:${map[domain] ?? 0}`).join("|");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Returns a cached payload. `load` runs only after a real write (or the first miss).
 * Optional restore/persist replace the generic snapshot row (used for closed KPI periods).
 */
export async function readThrough<T>(db: SqlDb, key: string, domains: Domain[], load: () => Promise<T>, hooks?: SnapshotHooks): Promise<T> {
  await settleWrites(db);
  const conn = connectionOf(db);
  let token = await epochToken(db, conn, domains);
  const changes = changesOf(conn);
  const memKey = `${connKey(conn)}\0${key}`;
  const hit = memory.get(memKey);
  const sameConnection = !hit || changes == null || hit.changes === changes;
  if (hit && hit.token === token && sameConnection) return clone(hit.value) as T;

  if (sameConnection) {
    const stored = hooks?.restore ? await hooks.restore(token) : await restoreSnapshot(db, key, token);
    if (stored !== undefined) {
      memory.set(memKey, { token, changes, value: stored });
      return clone(stored) as T;
    }
  }

  const value = await load();
  token = await epochToken(db, conn, domains);
  const before = rawTotal(conn);
  if (hooks?.persist) await hooks.persist(token, value);
  else await persistSnapshot(db, key, token, value);
  absorbCacheChanges(conn, before);
  memory.set(memKey, { token, changes: changesOf(conn), value });
  return clone(value) as T;
}

async function restoreSnapshot(db: SqlDb, key: string, token: string): Promise<unknown | undefined> {
  try {
    const row = await db.get<{ token: string; payload: string }>("SELECT token, payload FROM read_snapshots WHERE cache_key = ?", [key]);
    if (!row || row.token !== token) return undefined;
    return JSON.parse(row.payload) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/no such table/i.test(message)) return undefined;
    throw error;
  }
}

async function persistSnapshot(db: SqlDb, key: string, token: string, value: unknown) {
  const payload = JSON.stringify(value);
  if (payload.length > SNAPSHOT_LIMIT) return;
  try {
    await db.run(
      "INSERT INTO read_snapshots (cache_key, token, payload) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET token = excluded.token, payload = excluded.payload",
      [key, token, payload],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/no such table/i.test(message)) throw error;
  }
}

/** Drops in-memory hits so the next read proves it used the stored row, not a fresh scan. */
export function clearReadMemory() {
  memory.clear();
  epochMemory.clear();
}

export function sqlLike(pattern: string, value: string | null | undefined): boolean {
  let source = "^";
  for (const char of pattern) {
    if (char === "%") source += "[\\s\\S]*";
    else if (char === "_") source += "[\\s\\S]";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  source += "$";
  return new RegExp(source, "i").test(value ?? "");
}

export function binaryCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
