import { ensureBootstrapAdmin } from "@/lib/auth/users";
import { loadSeedPlan, type SeedExpected, type SeedPlan } from "@/lib/seed/plan";
import type { SqlDb } from "@/lib/sql/types";

const BATCH = 40;
const SETTING = "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

export type SeedReport = {
  complete: boolean;
  counts: SeedExpected;
  expected: SeedExpected;
};

type Stmt = { sql: string; params: unknown[] };

const PHASES = ["committee", "leads", "edits", "activities", "teams", "suppliers", "equipment", "catalogs", "finish"] as const;
type Phase = (typeof PHASES)[number] | "done";

export async function runSeed(db: SqlDb, options?: { maxBatches?: number; reset?: boolean }): Promise<SeedReport> {
  const maxBatches = options?.maxBatches ?? 1;
  if (options?.reset) await clearSeedData(db);
  if (!options?.reset && (await setting(db, "seed_complete")) === "1") {
    await ensureBootstrapAdmin(db);
    const counts = await readCounts(db);
    return { complete: true, counts, expected: counts };
  }

  const plan = await loadSeedPlan();
  let batches = 0;
  while (batches < maxBatches) {
    const wrote = await oneBatch(db, plan);
    if (!wrote) break;
    batches += 1;
  }
  await ensureBootstrapAdmin(db);
  const counts = await readCounts(db);
  const complete = (await setting(db, "seed_complete")) === "1";
  return { complete, counts, expected: plan.expected };
}

async function oneBatch(db: SqlDb, plan: SeedPlan): Promise<boolean> {
  let phase = ((await setting(db, "seed_phase")) || (await inferPhase(db, plan))) as Phase;
  let cursor = Number((await setting(db, "seed_cursor")) || "0");
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  while (phase !== "done") {
    if (phase === "committee") {
      if ((await countOf(db, "committee_docs")) > 0) {
        phase = "leads";
        cursor = 0;
        continue;
      }
      await writeBatch(db, [{ sql: "INSERT INTO committee_docs (number, held_on, is_current, payload, created_at) VALUES (?, ?, 1, ?, ?)", params: plan.committee }], "leads", 0);
      return true;
    }
    if (phase === "leads") {
      const chunk = plan.leads.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "edits";
        cursor = 0;
        continue;
      }
      const next = cursor + chunk.length;
      const nextPhase = next >= plan.leads.length ? "edits" : "leads";
      await writeBatch(
        db,
        chunk.map((params) => ({
          sql: `INSERT OR IGNORE INTO leads (import_key, name, type, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, next_activity_type, next_activity_summary, next_activity_deadline, odoo_id, edited_locally)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          params,
        })),
        nextPhase,
        nextPhase === "edits" ? 0 : next,
      );
      return true;
    }
    if (phase === "edits") {
      const edits = await db.all<{ import_key: string; patch_json: string }>("SELECT import_key, patch_json FROM lead_edits ORDER BY import_key");
      const chunk = edits.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "activities";
        cursor = 0;
        continue;
      }
      const next = cursor + chunk.length;
      const nextPhase = next >= edits.length ? "activities" : "edits";
      await writeBatch(
        db,
        chunk.map((edit) => {
          const patch = JSON.parse(edit.patch_json) as Record<string, string | number | null>;
          return {
            sql: `UPDATE leads SET stage = COALESCE(?, stage), expected_revenue = COALESCE(?, expected_revenue), probability = COALESCE(?, probability), expected_close = COALESCE(?, expected_close), salesperson = COALESCE(?, salesperson), next_activity_summary = COALESCE(?, next_activity_summary), edited_locally = 1 WHERE import_key = ?`,
            params: [patch.stage ?? null, patch.expectedRevenue ?? null, patch.probability ?? null, patch.expectedClose ?? null, patch.salesperson ?? null, patch.nextActivitySummary ?? null, edit.import_key],
          };
        }),
        nextPhase,
        nextPhase === "activities" ? 0 : next,
      );
      return true;
    }
    if (phase === "activities") {
      if (cursor === 0 && (await countOf(db, "activities")) >= plan.expected.activities) {
        phase = "teams";
        cursor = 0;
        continue;
      }
      const chunk = plan.activities.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "teams";
        cursor = 0;
        continue;
      }
      const statements: Stmt[] = [];
      if (cursor === 0) statements.push({ sql: "DELETE FROM activities", params: [] });
      const next = cursor + chunk.length;
      const nextPhase = next >= plan.activities.length ? "teams" : "activities";
      statements.push(
        ...chunk.map((params) => ({
          sql: `INSERT INTO activities (odoo_lead_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params,
        })),
      );
      await writeBatch(db, statements, nextPhase, nextPhase === "teams" ? 0 : next);
      return true;
    }
    if (phase === "teams") {
      if ((await countOf(db, "teams")) >= plan.expected.teams) {
        phase = "suppliers";
        cursor = 0;
        continue;
      }
      const flat: Stmt[] = [
        ...plan.teams.map((params) => ({ sql: "INSERT OR IGNORE INTO teams (name, leader, active, company) VALUES (?, ?, ?, ?)", params })),
        ...plan.members.map((params) => ({ sql: "INSERT OR IGNORE INTO team_members (team_name, member_name) VALUES (?, ?)", params })),
      ];
      const chunk = flat.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "suppliers";
        cursor = 0;
        continue;
      }
      const next = cursor + chunk.length;
      const nextPhase = next >= flat.length ? "suppliers" : "teams";
      await writeBatch(db, chunk, nextPhase, nextPhase === "suppliers" ? 0 : next);
      return true;
    }
    if (phase === "suppliers") {
      const chunk = plan.suppliers.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "equipment";
        cursor = 0;
        continue;
      }
      const next = cursor + chunk.length;
      const nextPhase = next >= plan.suppliers.length ? "equipment" : "suppliers";
      await writeBatch(
        db,
        chunk.map((params) => ({ sql: "INSERT OR REPLACE INTO suppliers (name, odoo_name, nit, email, needs_review) VALUES (?, ?, ?, ?, ?)", params })),
        nextPhase,
        nextPhase === "equipment" ? 0 : next,
      );
      return true;
    }
    if (phase === "equipment") {
      const chunk = plan.equipment.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "catalogs";
        cursor = 0;
        continue;
      }
      const next = cursor + chunk.length;
      const nextPhase = next >= plan.equipment.length ? "catalogs" : "equipment";
      await writeBatch(
        db,
        chunk.map((params) => ({
          sql: `INSERT OR IGNORE INTO equipment (
              serial, sheet_serial, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model,
              warranty_until, warranty_state, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label,
              client_name, address, city, city_source, location_raw, status, delivered_on, salesperson, lead_import_key, notes,
              dirty_json, sheet_cells_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '', '[]', ?, ?, ?)`,
          params,
        })),
        nextPhase,
        nextPhase === "catalogs" ? 0 : next,
      );
      return true;
    }
    if (phase === "catalogs") {
      const chunk = plan.catalogs.slice(cursor, cursor + BATCH);
      if (!chunk.length) {
        phase = "finish";
        cursor = 0;
        continue;
      }
      const next = cursor + chunk.length;
      const nextPhase = next >= plan.catalogs.length ? "finish" : "catalogs";
      await writeBatch(
        db,
        chunk.map((params) => ({
          sql: "INSERT INTO catalogs (kind, value, sort_order) VALUES (?, ?, ?) ON CONFLICT(kind, value) DO NOTHING",
          params,
        })),
        nextPhase,
        nextPhase === "finish" ? 0 : next,
      );
      return true;
    }
    const counts = await readCounts(db);
    const ready = counts.leads >= plan.expected.leads && counts.activities >= plan.expected.activities && counts.teams >= plan.expected.teams && counts.equipment >= plan.expected.equipment;
    const statements: Stmt[] = [
      ...((await countOf(db, "email_templates")) === 0
        ? plan.templates.map((params) => ({ sql: "INSERT INTO email_templates (id, name, subject, body, sort_order) VALUES (?, ?, ?, ?, ?)", params }))
        : []),
      ...plan.stages.map((params) => ({
        sql: "INSERT INTO stages (name, position, is_won, is_lost, team_restriction, short_label) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO NOTHING",
        params,
      })),
    ];
    if (!(await setting(db, "maintenance_hourly_rate_cop"))) {
      statements.push({ sql: "INSERT INTO app_settings (key, value) VALUES (?, ?)", params: ["maintenance_hourly_rate_cop", "50000"] });
    }
    if (ready) {
      statements.push({ sql: SETTING, params: ["seed_complete", "1"] });
      statements.push({ sql: SETTING, params: ["seed_phase", "done"] });
      statements.push({ sql: SETTING, params: ["seed_cursor", "0"] });
      await writeBatch(db, statements, "done", 0);
      return true;
    }
    await writeBatch(db, statements, lackingPhase(counts, plan.expected), 0);
    return true;
  }
  return false;
}

function lackingPhase(counts: SeedExpected, expected: SeedExpected): Phase {
  if (counts.leads < expected.leads) return "leads";
  if (counts.activities < expected.activities) return "activities";
  if (counts.teams < expected.teams) return "teams";
  if (counts.equipment < expected.equipment) return "equipment";
  return "finish";
}

async function inferPhase(db: SqlDb, plan: SeedPlan): Promise<Phase> {
  if ((await countOf(db, "committee_docs")) === 0) return "committee";
  const counts = await readCounts(db);
  if (counts.leads < plan.expected.leads) return "leads";
  if (counts.activities < plan.expected.activities) return "activities";
  if (counts.teams < plan.expected.teams) return "teams";
  if (counts.equipment < plan.expected.equipment) return "suppliers";
  return "catalogs";
}

async function writeBatch(db: SqlDb, statements: Stmt[], phase: Phase, cursor: number) {
  const all = statements.some((stmt) => stmt.sql === SETTING && stmt.params[0] === "seed_phase")
    ? statements
    : [...statements, { sql: SETTING, params: ["seed_phase", phase] }, { sql: SETTING, params: ["seed_cursor", String(cursor)] }];
  await db.exec("BEGIN");
  try {
    for (const stmt of all) await db.run(stmt.sql, stmt.params);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function clearSeedData(db: SqlDb) {
  const tables = [
    "activities",
    "leads",
    "team_members",
    "teams",
    "equipment_history",
    "maintenance_logs",
    "equipment",
    "suppliers",
    "catalogs",
    "committee_docs",
    "email_templates",
    "stages",
  ];
  await db.exec("BEGIN");
  try {
    for (const table of tables) await db.run(`DELETE FROM ${table}`);
    await db.run("DELETE FROM app_settings WHERE key LIKE 'seed_%'");
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function readCounts(db: SqlDb): Promise<SeedExpected> {
  return {
    leads: await countOf(db, "leads"),
    activities: await countOf(db, "activities"),
    teams: await countOf(db, "teams"),
    equipment: await countOf(db, "equipment"),
  };
}

async function countOf(db: SqlDb, table: string): Promise<number> {
  const row = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(row?.n ?? 0);
}

async function setting(db: SqlDb, key: string): Promise<string | null> {
  const row = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? null;
}
