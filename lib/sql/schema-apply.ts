import { ALTERS, splitSql, SCHEMA } from "@/lib/schema";
import type { SqlDb } from "@/lib/sql/types";

export async function applySchema(db: SqlDb): Promise<void> {
  for (const statement of splitSql(SCHEMA)) {
    await db.exec(statement);
  }
  for (const statement of ALTERS) {
    try {
      await db.exec(statement);
    } catch {
      // Already present.
    }
  }
}
