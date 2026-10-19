export type SqlParams = unknown[];

export type SqlRun = {
  changes: number;
  lastInsertRowid: number;
};

export type SqlBatch = {
  sql: string;
  params?: SqlParams;
};

/**
 * Statements per D1 `batch()` call. Each call is one API request, and a Worker
 * invocation fails around a thousand of those ("Too many API requests by single
 * Worker invocation").
 */
export const SQL_BATCH_LIMIT = 80;

/** Async SQL used by both node:sqlite (tests, local Next) and Cloudflare D1. */
export type SqlDb = {
  readonly kind: "sql";
  exec(sql: string): Promise<void>;
  get<T>(sql: string, params?: SqlParams): Promise<T | undefined>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  run(sql: string, params?: SqlParams): Promise<SqlRun>;
  /** One round trip on D1. Each entry is the row list for that statement. */
  batch(statements: SqlBatch[]): Promise<unknown[][]>;
};

export function isSqlDb(value: unknown): value is SqlDb {
  return !!value && typeof value === "object" && (value as { kind?: string }).kind === "sql";
}
