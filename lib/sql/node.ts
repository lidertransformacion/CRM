import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ALTERS, COMMERCIAL_ROLE_SQL, SCHEMA } from "@/lib/schema";
import { alterTarget, columnListed, pragmaTableInfo } from "@/lib/sql/alters";
import { bindChanges, bindConnection, noteWrite, settleWrites, transactionDepth } from "@/lib/sql/read-cache";
import { addRowsRead, estimateRowsRead, indexColumns } from "@/lib/sql/rows";
import type { SqlDb } from "@/lib/sql/types";

function applySync(db: DatabaseSync) {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  for (const statement of ALTERS) {
    const { table, column } = alterTarget(statement);
    const rows = db.prepare(pragmaTableInfo(table)).all() as { name: string }[];
    if (columnListed(rows, column)) continue;
    db.exec(statement);
  }
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS equipment_internal_id ON equipment(internal_id)");
  } catch {
    // Index already declared in SCHEMA.
  }
  db.exec(COMMERCIAL_ROLE_SQL);
}

export function openDatabaseSync(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  applySync(db);
  return db;
}

function plain<T>(row: T | undefined): T | undefined {
  if (row == null) return undefined;
  return { ...(row as object) } as T;
}

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(table: string): string {
  if (!IDENT.test(table)) throw new Error("Refusing to count a table that is not an identifier.");
  return table;
}

export function wrapDatabaseSync(db: DatabaseSync): SqlDb {
  const cards = new Map<string, number>();
  let indexes: Map<string, string[]> | null = null;

  function loadIndexes() {
    const map = new Map<string, string[]>();
    const rows = db.prepare("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all() as {
      tbl_name: string;
      sql: string;
    }[];
    for (const row of rows) {
      const column = indexColumns(row.sql)[0];
      if (!column) continue;
      const table = row.tbl_name.toLowerCase();
      const list = map.get(table) ?? [];
      list.push(column);
      map.set(table, list);
    }
    indexes = map;
  }

  function plan() {
    if (!indexes) loadIndexes();
    return {
      cardinality(table: string) {
        const key = table.toLowerCase();
        const cached = cards.get(key);
        if (cached != null) return cached;
        const row = db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(key)}`).get() as { n: number };
        const count = Number(row?.n ?? 0);
        cards.set(key, count);
        return count;
      },
      indexed(table: string, column: string) {
        return indexes?.get(table.toLowerCase())?.includes(column.toLowerCase()) ?? false;
      },
    };
  }

  function charge(sql: string, returned: number) {
    if (/^\s*create\s+(unique\s+)?index\b/i.test(sql)) indexes = null;
    addRowsRead(estimateRowsRead(sql, returned, plan()));
  }

  function wrote(sql: string) {
    noteWrite(db, sql);
    if (!/^\s*(insert|update|delete|replace)\b/i.test(sql) && !/\b(insert\s+into|delete\s+from|update)\b/i.test(sql)) return;
    for (const match of sql.matchAll(/\b(?:into|update|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
      cards.delete(match[1].toLowerCase());
    }
  }

  bindChanges(db, () => Number((db.prepare("SELECT total_changes() AS n").get() as { n: number } | undefined)?.n ?? 0));

  const wrapped: SqlDb = {
    kind: "sql",
    async exec(sql: string) {
      if (/^\s*COMMIT\b/i.test(sql)) await settleWrites(wrapped, true);
      db.exec(sql);
      wrote(sql);
      charge(sql, 0);
      if (transactionDepth(db) === 0) await settleWrites(wrapped);
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const row = plain(db.prepare(sql).get(...(params as never[])) as T | undefined);
      charge(sql, row == null ? 0 : 1);
      return row;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const rows = (db.prepare(sql).all(...(params as never[])) as T[]).map((row) => ({ ...(row as object) }) as T);
      charge(sql, rows.length);
      return rows;
    },
    async run(sql: string, params: unknown[] = []) {
      const result = db.prepare(sql).run(...(params as never[]));
      charge(sql, Number(result.changes ?? 0));
      wrote(sql);
      if (transactionDepth(db) === 0) await settleWrites(wrapped);
      return { changes: Number(result.changes ?? 0), lastInsertRowid: Number(result.lastInsertRowid ?? 0) };
    },
    async batch(statements: { sql: string; params?: unknown[] }[]) {
      const rows = statements.map((stmt) => {
        const params = stmt.params ?? [];
        const prepared = db.prepare(stmt.sql);
        if (/^\s*(select|with|pragma)\b/i.test(stmt.sql)) {
          const selected = (prepared.all(...(params as never[])) as object[]).map((row) => ({ ...row }));
          charge(stmt.sql, selected.length);
          return selected;
        }
        prepared.run(...(params as never[]));
        charge(stmt.sql, 0);
        wrote(stmt.sql);
        return [];
      });
      if (transactionDepth(db) === 0) await settleWrites(wrapped);
      return rows;
    },
  };
  bindConnection(wrapped, db);
  return wrapped;
}

export async function openNodeSql(file: string): Promise<SqlDb> {
  return wrapDatabaseSync(openDatabaseSync(file));
}
