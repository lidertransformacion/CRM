import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { advanceSeed, openDatabase, seedIfEmpty } from "@/lib/db";

describe("resumable seed", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
  });

  it("fills missing equipment without duplicating a finished snapshot", async () => {
    const file = path.join(os.tmpdir(), `crm-seed-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    created.push(file);
    const db = await openDatabase(file);
    const first = await seedIfEmpty(db);
    expect(first.complete).toBe(true);
    expect(first.counts).toEqual({ leads: 699, activities: 72, teams: 32, equipment: 224 });

    const lead = db.prepare("SELECT import_key, name FROM leads LIMIT 1").get() as { import_key: string; name: string };
    const removed = db.prepare("SELECT serial FROM equipment ORDER BY serial LIMIT 12").all() as { serial: string }[];
    const placeholders = removed.map(() => "?").join(", ");
    db.prepare(`DELETE FROM equipment WHERE serial IN (${placeholders})`).run(...removed.map((row) => row.serial));
    db.prepare("DELETE FROM app_settings WHERE key IN ('seed_complete', 'seed_phase', 'seed_cursor')").run();
    expect((db.prepare("SELECT COUNT(*) AS n FROM equipment").get() as { n: number }).n).toBe(212);

    let report = await advanceSeed(db, { maxBatches: 1 });
    let guard = 0;
    while (!report.complete && guard < 30) {
      report = await advanceSeed(db, { maxBatches: 1 });
      guard += 1;
    }
    expect(report.complete).toBe(true);
    expect(report.counts).toEqual({ leads: 699, activities: 72, teams: 32, equipment: 224 });
    expect(db.prepare("SELECT name FROM leads WHERE import_key = ?").get(lead.import_key)).toEqual({ name: lead.name });
    expect((db.prepare("SELECT COUNT(*) AS n FROM activities").get() as { n: number }).n).toBe(72);

    const again = await seedIfEmpty(db);
    expect(again.counts).toEqual({ leads: 699, activities: 72, teams: 32, equipment: 224 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM leads").get() as { n: number }).n).toBe(699);
  });
});
