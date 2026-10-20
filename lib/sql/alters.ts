/** Parsed from the constant ALTERS list. Table and column names are identifiers only. */
export function alterTarget(sql: string): { table: string; column: string } {
  const match = /^ALTER TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(sql.trim());
  if (!match) throw new Error(`Refusing to run an ALTER that is not ADD COLUMN: ${sql}`);
  return { table: match[1], column: match[2] };
}

export function pragmaTableInfo(table: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error("Refusing to inspect a table name that is not an identifier.");
  return `PRAGMA table_info(${table})`;
}

export function columnListed(rows: { name?: string }[], column: string): boolean {
  const wanted = column.toLowerCase();
  return rows.some((row) => (row.name ?? "").toLowerCase() === wanted);
}
