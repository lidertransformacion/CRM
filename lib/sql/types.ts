export type SqlParams = unknown[];

export type SqlRun = {
  changes: number;
  lastInsertRowid: number;
};

/** Async SQL used by both node:sqlite (tests, local Next) and Cloudflare D1. */
export type SqlDb = {
  readonly kind: "sql";
  exec(sql: string): Promise<void>;
  get<T>(sql: string, params?: SqlParams): Promise<T | undefined>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  run(sql: string, params?: SqlParams): Promise<SqlRun>;
};

export function isSqlDb(value: unknown): value is SqlDb {
  return !!value && typeof value === "object" && (value as { kind?: string }).kind === "sql";
}
