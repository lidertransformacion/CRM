import { splitSql } from "@/lib/schema";
import type { SqlDb } from "@/lib/sql/types";

type Stmt = { sql: string; params: unknown[] };

/**
 * D1 has no interactive transactions. BEGIN buffers writes and COMMIT submits them with batch().
 * Reads flush the buffer first. ROLLBACK drops writes that have not been flushed.
 */
export function wrapD1(d1: D1Database): SqlDb {
  let buffer: Stmt[] | null = null;

  const BATCH_LIMIT = 80;

  async function flush() {
    if (!buffer?.length) return;
    const pending = buffer;
    buffer = buffer ? [] : null;
    for (let index = 0; index < pending.length; index += BATCH_LIMIT) {
      const slice = pending.slice(index, index + BATCH_LIMIT);
      await d1.batch(slice.map((stmt) => d1.prepare(stmt.sql).bind(...stmt.params)));
    }
  }

  return {
    kind: "sql",
    async exec(sql: string) {
      const trimmed = sql.trim();
      if (/^BEGIN\b/i.test(trimmed)) {
        buffer = [];
        return;
      }
      if (/^COMMIT\b/i.test(trimmed)) {
        await flush();
        buffer = null;
        return;
      }
      if (/^ROLLBACK\b/i.test(trimmed)) {
        buffer = null;
        return;
      }
      // D1 exec() rejects multi-line SQL with "incomplete input". One prepare().run() per statement.
      for (const part of splitSql(sql)) {
        if (buffer) buffer.push({ sql: part, params: [] });
        else await d1.prepare(part).bind().run();
      }
    },
    async get<T>(sql: string, params: unknown[] = []) {
      if (buffer?.length) await flush();
      const row = await d1.prepare(sql).bind(...params).first<T>();
      return row ?? undefined;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      if (buffer?.length) await flush();
      const result = await d1.prepare(sql).bind(...params).all<T>();
      return result.results ?? [];
    },
    async run(sql: string, params: unknown[] = []) {
      if (buffer) {
        buffer.push({ sql, params });
        return { changes: 0, lastInsertRowid: 0 };
      }
      const result = await d1.prepare(sql).bind(...params).run();
      return { changes: Number(result.meta?.changes ?? 0), lastInsertRowid: Number(result.meta?.last_row_id ?? 0) };
    },
    async batch(statements: { sql: string; params?: unknown[] }[]) {
      if (buffer?.length) await flush();
      if (!statements.length) return [];
      const results = await d1.batch(statements.map((stmt) => d1.prepare(stmt.sql).bind(...(stmt.params ?? []))));
      return results.map((result) => result.results ?? []);
    },
  };
}
