import { ALTERS, COMMERCIAL_ROLE_SQL, SCHEMA, SCHEMA_VERSION, splitSql } from "@/lib/schema";
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
 * ALTERS stay outside the batch: a duplicate column must not roll the rest back.
 */
export async function applySchema(db: SqlDb): Promise<void> {
  if ((await schemaVersion(db)) === SCHEMA_VERSION) return;
  const statements = splitSql(SCHEMA).map((sql) => ({ sql }));
  if (statements.length) await db.batch(statements);
  for (const statement of ALTERS) {
    try {
      await db.exec(statement);
    } catch {
      // Already present.
    }
  }
  await db.exec(COMMERCIAL_ROLE_SQL);
  await db.run("INSERT INTO app_settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    SCHEMA_VERSION,
  ]);
}
