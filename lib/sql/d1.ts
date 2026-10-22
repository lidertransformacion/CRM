import { splitSql } from "@/lib/schema";
import { bindConnection, isSettling, noteWrite, settleWrites } from "@/lib/sql/read-cache";
import { addRowsRead } from "@/lib/sql/rows";
import { SQL_BATCH_LIMIT, type SqlDb } from "@/lib/sql/types";

type Stmt = { sql: string; params: unknown[] };

/**
 * D1 has no interactive transactions. BEGIN buffers writes and COMMIT submits them with batch().
 * Reads flush the buffer first. ROLLBACK drops writes that have not been flushed.
 */
export function wrapD1(d1: D1Database): SqlDb {
  let buffer: Stmt[] | null = null;

  async function flush() {
    if (!buffer?.length) return;
    const pending = buffer;
    buffer = buffer ? [] : null;
    for (let index = 0; index < pending.length; index += SQL_BATCH_LIMIT) {
      const slice = pending.slice(index, index + SQL_BATCH_LIMIT);
      await d1.batch(slice.map((stmt) => d1.prepare(stmt.sql).bind(...stmt.params)));
    }
  }

  function takeRead(meta?: { rows_read?: number }) {
    if (typeof meta?.rows_read === "number") addRowsRead(meta.rows_read);
  }

  const wrapped: SqlDb = {
    kind: "sql",
    async exec(sql: string) {
      const trimmed = sql.trim();
      if (/^BEGIN\b/i.test(trimmed)) {
        buffer = [];
        noteWrite(d1, trimmed);
        return;
      }
      if (/^COMMIT\b/i.test(trimmed)) {
        await settleWrites(wrapped, true);
        await flush();
        buffer = null;
        noteWrite(d1, trimmed);
        return;
      }
      if (/^ROLLBACK\b/i.test(trimmed)) {
        buffer = null;
        noteWrite(d1, trimmed);
        return;
      }
      // D1 exec() rejects multi-line SQL with "incomplete input". One prepare().run() per statement.
      for (const part of splitSql(sql)) {
        if (buffer) buffer.push({ sql: part, params: [] });
        else await d1.prepare(part).bind().run();
      }
    },
    async get<T>(sql: string, params: unknown[] = []) {
      if (buffer?.length && !isSettling()) await flush();
      const result = await d1.prepare(sql).bind(...params).all<T>();
      takeRead(result.meta);
      return result.results?.[0];
    },
    async all<T>(sql: string, params: unknown[] = []) {
      if (buffer?.length && !isSettling()) await flush();
      const result = await d1.prepare(sql).bind(...params).all<T>();
      takeRead(result.meta);
      return result.results ?? [];
    },
    async run(sql: string, params: unknown[] = []) {
      if (buffer) {
        buffer.push({ sql, params });
        noteWrite(d1, sql);
        return { changes: 0, lastInsertRowid: 0 };
      }
      const result = await d1.prepare(sql).bind(...params).run();
      takeRead(result.meta);
      noteWrite(d1, sql);
      if (!isSettling()) await settleWrites(wrapped);
      return { changes: Number(result.meta?.changes ?? 0), lastInsertRowid: Number(result.meta?.last_row_id ?? 0) };
    },
    async batch(statements: { sql: string; params?: unknown[] }[]) {
      if (buffer?.length) await flush();
      if (!statements.length) return [];
      const collected: unknown[][] = [];
      for (let index = 0; index < statements.length; index += SQL_BATCH_LIMIT) {
        const slice = statements.slice(index, index + SQL_BATCH_LIMIT);
        const results = await d1.batch(slice.map((stmt) => d1.prepare(stmt.sql).bind(...(stmt.params ?? []))));
        for (const result of results) {
          takeRead(result.meta);
          collected.push(result.results ?? []);
        }
      }
      for (const stmt of statements) noteWrite(d1, stmt.sql);
      if (!buffer && !isSettling()) await settleWrites(wrapped);
      return collected;
    },
  };
  bindConnection(wrapped, d1);
  return wrapped;
}
