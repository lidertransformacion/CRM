import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ALTERS, SCHEMA } from "@/lib/schema";
import type { SqlDb } from "@/lib/sql/types";

function applySync(db: DatabaseSync) {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  for (const statement of ALTERS) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists on databases created with the current schema.
    }
  }
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS equipment_internal_id ON equipment(internal_id)");
  } catch {
    // Index already declared in SCHEMA.
  }
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

export function wrapDatabaseSync(db: DatabaseSync): SqlDb {
  return {
    kind: "sql",
    async exec(sql: string) {
      db.exec(sql);
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return plain(db.prepare(sql).get(...(params as never[])) as T | undefined);
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).all(...(params as never[])) as T[]).map((row) => ({ ...(row as object) }) as T);
    },
    async run(sql: string, params: unknown[] = []) {
      const result = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes ?? 0), lastInsertRowid: Number(result.lastInsertRowid ?? 0) };
    },
    async batch(statements: { sql: string; params?: unknown[] }[]) {
      return statements.map((stmt) => {
        const params = stmt.params ?? [];
        const prepared = db.prepare(stmt.sql);
        if (/^\s*(select|with|pragma)\b/i.test(stmt.sql)) {
          return (prepared.all(...(params as never[])) as object[]).map((row) => ({ ...row }));
        }
        prepared.run(...(params as never[]));
        return [];
      });
    },
  };
}

export async function openNodeSql(file: string): Promise<SqlDb> {
  return wrapDatabaseSync(openDatabaseSync(file));
}
