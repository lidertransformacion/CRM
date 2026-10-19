import { describe, expect, it } from "vitest";
import { SCHEMA } from "@/lib/schema";
import { wrapD1 } from "@/lib/sql/d1";
import { splitSqlStatements } from "@/lib/sql/statements";

describe("splitSqlStatements", () => {
  it("keeps a semicolon inside a quoted string in one statement", () => {
    const statements = splitSqlStatements("INSERT INTO t (note) VALUES ('a;b'); INSERT INTO t (note) VALUES (2);");
    expect(statements).toEqual(["INSERT INTO t (note) VALUES ('a;b')", "INSERT INTO t (note) VALUES (2)"]);
  });

  it("keeps semicolons inside a CREATE TRIGGER body", () => {
    const script = `
      CREATE TRIGGER t AFTER INSERT ON leads
      BEGIN
        UPDATE leads SET name = 'a;b';
        SELECT 1;
      END;
      SELECT 1;
    `;
    const statements = splitSqlStatements(script);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/CREATE TRIGGER/);
    expect(statements[0]).toMatch(/'a;b'/);
    expect(statements[0]).toMatch(/END$/);
    expect(statements[1]).toBe("SELECT 1");
  });

  it("keeps a statement that follows a leading comment", () => {
    const statements = splitSqlStatements("SELECT 1; -- note; still a comment\nSELECT 2;");
    expect(statements).toEqual(["SELECT 1", "SELECT 2"]);
  });
});

describe("wrapD1 schema apply", () => {
  it("runs each schema statement with prepare().run() and never calls exec()", async () => {
    const runs: string[] = [];
    const execCalls: string[] = [];
    const d1 = {
      exec: async (sql: string) => {
        execCalls.push(sql);
        throw new Error("D1_EXEC_ERROR: incomplete input");
      },
      prepare(sql: string) {
        return {
          bind: () => ({
            async run() {
              runs.push(sql);
              return { meta: { changes: 0, last_row_id: 0 } };
            },
            async first() {
              return null;
            },
            async all() {
              return { results: [] };
            },
          }),
        };
      },
      batch: async () => [],
    };

    await wrapD1(d1 as unknown as D1Database).exec(SCHEMA);
    expect(execCalls).toEqual([]);
    expect(runs.length).toBeGreaterThan(10);
    for (const sql of runs) {
      expect(sql.includes(";"), sql).toBe(false);
      expect(sql).toMatch(/^(CREATE|CREATE TABLE|CREATE INDEX|CREATE UNIQUE)/i);
    }
  });
});
