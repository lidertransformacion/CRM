import { ALTERS, COMMERCIAL_ROLE_SQL, SCHEMA, SCHEMA_VERSION, splitSql } from "@/lib/schema";
import { alterTarget, columnListed, pragmaTableInfo } from "@/lib/sql/alters";
import type { SqlDb } from "@/lib/sql/types";

async function schemaVersion(db: SqlDb): Promise<string | null> {
  try {
    const row = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'schema_version'");
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * DDL runs once per database. A later isolate reads schema_version and returns.
 * ALTERS stay outside the batch. Each one runs only when PRAGMA table_info
 * does not already list the column, so a second boot does not fail.
 */
export async function applySchema(db: SqlDb): Promise<void> {
  if ((await schemaVersion(db)) === SCHEMA_VERSION) return;
  const statements = splitSql(SCHEMA).map((sql) => ({ sql }));
  if (statements.length) await db.batch(statements);
  for (const statement of ALTERS) {
    const { table, column } = alterTarget(statement);
    const rows = await db.all<{ name: string }>(pragmaTableInfo(table));
    if (columnListed(rows, column)) continue;
    await db.exec(statement);
  }
  await db.exec(COMMERCIAL_ROLE_SQL);
  await db.run("INSERT INTO app_settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    SCHEMA_VERSION,
  ]);
}
