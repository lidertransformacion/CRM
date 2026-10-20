import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA } from "@/lib/schema";
import { wrapD1 } from "@/lib/sql/d1";
import { openDatabaseSync } from "@/lib/sql/node";
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

describe("integrated migrations", () => {
  it("applies 0003 through 0008 twice on a database that already has the columns", () => {
    const file = path.join(os.tmpdir(), `crm-migrate-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    const db = openDatabaseSync(file);
    const dir = path.join(process.cwd(), "migrations");
    const names = fs.readdirSync(dir).filter((name) => /^000[3-8]_/.test(name)).sort();
    expect(names).toEqual([
      "0003_users_soft_delete.sql",
      "0004_visits.sql",
      "0005_committee_mail.sql",
      "0006_rich_mail.sql",
      "0007_legal.sql",
      "0008_storage_quota.sql",
    ]);
    const script = names.map((name) => fs.readFileSync(path.join(dir, name), "utf8")).join("\n");
    db.exec(script);
    db.exec(script);
    const usage = db.prepare("SELECT bytes_used FROM storage_usage WHERE id = 1").get() as { bytes_used: number };
    expect(usage.bytes_used).toBe(0);
    db.close();
    fs.rmSync(file, { force: true });
  });
});
