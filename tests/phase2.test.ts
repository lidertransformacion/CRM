import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEquipment, openDatabase } from "@/lib/db";
import { deliverMail } from "@/lib/mail/deliver";
import { sendGmail } from "@/lib/mail/gmail";
import { DEFAULT_FROM_ADDRESS, DEFAULT_FROM_NAME, fromIdentity, rfc822 } from "@/lib/mail/message";
import { enqueueEmail, processOutbox } from "@/lib/mail/outbox";
import { OdooSyncAdapter } from "@/lib/odoo/adapter";
import { commitSnapshot, ingestSnapshot, normalizeLabel } from "@/lib/odoo/ingest";
import { canonicalStage } from "@/lib/odoo/stages";
import { acknowledgeOutbound, queueOutbound } from "@/lib/odoo/outbound";
import { googleAccessToken, signServiceAccountJwt } from "@/lib/sheets/live";
import { applySnapshot, pullFromSheet, rememberPush } from "@/lib/sheets/sync";
import { wrapDatabaseSync } from "@/lib/sql/node";
import { SQL_BATCH_LIMIT, type SqlDb } from "@/lib/sql/types";
import type { PushPlan, SheetSnapshot } from "@/lib/sheets/types";

const created: string[] = [];

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-phase2-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  created.push(file);
  const raw = await openDatabase(file);
  return { file, raw, db: wrapDatabaseSync(raw) };
}

function snapshot(serial: string, name: string, site = "ZG"): SheetSnapshot {
  const cells = {
    "Nº de serie": serial,
    "Nombre del equipo": name,
    "Categoría del equipo": "Máquina de café",
    ID: site,
    idnum: "1",
    Ubicación: "Zona G",
    "Ubicación Comercial cliente hospitality": "",
    Proveedor: "Dalla Corte",
    "Referencia de Proveedor": "",
    Modelo: "",
    "Fecha expiración Garantía": "",
    "Frecuencia Mantenimiento [dias]": "90",
    "Duracción Mantenimiento [horas]": "1 - 3",
  };
  return {
    spreadsheetId: "1mrb-s2PbDOEvNwdAs2zMyT7czMxx1tqcYGuwk4FQks4",
    tabName: "Listado Equipos",
    headers: Object.keys(cells),
    rows: [{ rowNumber: 2, serial, cells }],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const file of created.splice(0)) fs.rmSync(file, { force: true });
});

describe("email outbox", () => {
  it("keeps mail queued in log mode and does not call Gmail", async () => {
    vi.stubEnv("MAIL_MODE", "log");
    vi.stubEnv("MAIL_FROM_ADDRESS", "");
    vi.stubEnv("MAIL_FROM_NAME", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { db } = await tempSql();
    expect(await fromIdentity()).toEqual({ address: DEFAULT_FROM_ADDRESS, name: DEFAULT_FROM_NAME });
    const first = await enqueueEmail(db, { to: "cliente@hotel.com", subject: "Oferta", body: "Hola", dedupeKey: "oferta:1" });
    const second = await enqueueEmail(db, { to: "cliente@hotel.com", subject: "Oferta", body: "Hola", dedupeKey: "oferta:1" });
    expect(second).toMatchObject({ id: first.id, deduped: true });
    const summary = await processOutbox(db);
    expect(summary.sent).toBe(0);
    expect(summary.queued).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    const row = await db.get<{ status: string; provider_message_id: string | null }>("SELECT status, provider_message_id FROM email_outbox WHERE id = ?", [first.id]);
    expect(row).toMatchObject({ status: "queued", provider_message_id: null });
    expect(await deliverMail({ to: "cliente@hotel.com", subject: "Asunto", text: "Cuerpo" })).toBe("log");
    const message = rfc822({
      to: "cliente@hotel.com",
      subject: "Asunto",
      text: "Cuerpo",
      fromAddress: DEFAULT_FROM_ADDRESS,
      fromName: DEFAULT_FROM_NAME,
    });
    expect(message).toContain("From: Comercial Libertario <lidertransformacion@libertariocoffee.com>");
  });

  it("skips opted-out recipients and backs off a failed attempt", async () => {
    const { db } = await tempSql();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO users (email, password_hash, role, email_opt_out, created_at, updated_at) VALUES (?, 'x', 'user', 1, ?, ?)`,
      ["off@libertariocoffee.com", now, now],
    );
    await enqueueEmail(db, { to: "off@libertariocoffee.com", subject: "No", body: "No enviar" });
    const skipped = await processOutbox(db, { deliver: async () => "should-not-run" });
    expect(skipped.skipped).toBe(1);
    await enqueueEmail(db, { to: "cliente@hotel.com", subject: "Reintento", body: "Hola" });
    const failed = await processOutbox(db, {
      now: new Date("2026-10-19T12:00:00.000Z"),
      deliver: async () => {
        throw new Error("smtp down");
      },
    });
    expect(failed.queued).toBe(1);
    const row = await db.get<{ status: string; attempts: number; next_attempt_at: string }>(
      "SELECT status, attempts, next_attempt_at FROM email_outbox WHERE subject = ?",
      ["Reintento"],
    );
    expect(row?.status).toBe("queued");
    expect(row?.attempts).toBe(1);
    expect(row?.next_attempt_at).toBe("2026-10-19T12:01:00.000Z");
  });

  it("sends through the Gmail API only when that mode is selected", async () => {
    vi.stubEnv("GMAIL_TOKEN_JSON", JSON.stringify({ client_id: "id", client_secret: "secret", refresh_token: "refresh" }));
    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "gmail-1" }), { status: 200 });
    });
    const id = await sendGmail(
      {
        to: "cliente@hotel.com",
        subject: "Oferta",
        text: "Hola",
        fromAddress: DEFAULT_FROM_ADDRESS,
        fromName: DEFAULT_FROM_NAME,
      },
      fetchSpy as unknown as typeof fetch,
    );
    expect(id).toBe("gmail-1");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const gmailUrls = fetchSpy.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("gmail.googleapis.com"));
    expect(gmailUrls).toEqual(["https://gmail.googleapis.com/gmail/v1/users/me/messages/send"]);
    const source = fs.readFileSync(path.join(process.cwd(), "lib/mail/gmail.ts"), "utf8");
    expect(source).not.toContain("users/me/profile");
    expect(source).not.toContain("gmail.readonly");
    const { db } = await tempSql();
    await enqueueEmail(db, { to: "cliente@hotel.com", subject: "Oferta", body: "Hola" });
    vi.stubEnv("MAIL_MODE", "gmail_api");
    vi.stubGlobal("fetch", fetchSpy);
    const summary = await processOutbox(db);
    expect(summary.sent).toBe(1);
    const sent = await db.get<{ status: string; provider_message_id: string }>("SELECT status, provider_message_id FROM email_outbox WHERE subject = ?", ["Oferta"]);
    expect(sent).toMatchObject({ status: "sent", provider_message_id: "gmail-1" });
    fetchSpy.mockClear();
    vi.stubEnv("MAIL_MODE", "log");
    expect(await deliverMail({ to: "cliente@hotel.com", subject: "Oferta", text: "Hola" })).toBe("log");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("equipment sheet sync", () => {
  it("signs the service-account JWT with Web Crypto", async () => {
    expect(fs.readFileSync(path.join(process.cwd(), "lib/sheets/live.ts"), "utf8")).not.toContain("createSign");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = await signServiceAccountJwt({ clientEmail: "sheets@example.iam.gserviceaccount.com", privateKey: pem }, 1_700_000_000);
    const [header, payload, signature] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss: string; scope: string };
    expect(claims.iss).toBe("sheets@example.iam.gserviceaccount.com");
    expect(claims.scope).toContain("spreadsheets");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ access_token: "ya29" }), { status: 200 }));
    await googleAccessToken(
      { clientEmail: "sheets@example.iam.gserviceaccount.com", privateKey: pem, spreadsheetId: "1mrb-s2PbDOEvNwdAs2zMyT7czMxx1tqcYGuwk4FQks4", tabName: "Listado Equipos" },
      fetchSpy as unknown as typeof fetch,
    );
    const body = String(fetchSpy.mock.calls[0]?.[1] && (fetchSpy.mock.calls[0][1] as { body?: unknown }).body);
    expect(body).toContain("grant_type=urn");
  });

  it("keeps the sheet authoritative on pull and refuses to write while sync is off", async () => {
    vi.stubEnv("SHEETS_SYNC_ENABLED", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { raw, db } = await tempSql();
    await createEquipment({ serial: "C1", name: "Viejo", category: "Máquina de café", siteId: "ZG" }, raw);
    await db.run("UPDATE equipment SET dirty_json = ? WHERE serial = ?", [JSON.stringify(["name"]), "C1"]);
    const refused = await pullFromSheet(db);
    expect(refused.written).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await db.get<{ name: string }>("SELECT name FROM equipment WHERE serial = ?", ["C1"]))?.name).toBe("Viejo");

    const applied = await applySnapshot(db, snapshot("C1", "Nuevo"));
    expect(applied).toMatchObject({ written: true, updated: 1, inserted: 0 });
    const row = await db.get<{ name: string; dirty_json: string; sheet_serial: string }>("SELECT name, dirty_json, sheet_serial FROM equipment WHERE serial = ?", ["C1"]);
    expect(row).toMatchObject({ name: "Nuevo", dirty_json: "[]", sheet_serial: "C1" });

    const inserted = await applySnapshot(db, snapshot("C2", "Alta"));
    expect(inserted.inserted).toBe(1);
    const skipped = await applySnapshot(db, snapshot("C3", "Mala sede", "NOPE"));
    expect(skipped.skipped[0]?.serial).toBe("C3");
    expect(await db.get("SELECT serial FROM equipment WHERE serial = ?", ["C3"])).toBeUndefined();

    const plan: PushPlan = {
      updates: [{ serial: "C1", rowNumber: 2, changes: [{ column: "Nombre del equipo", from: "Viejo", to: "Nuevo" }] }],
      inserts: [],
      deletes: [],
      formulaNotes: [],
    };
    await db.run("UPDATE equipment SET dirty_json = ? WHERE serial = ?", [JSON.stringify(["name"]), "C1"]);
    expect(await rememberPush(db, plan)).toBe(1);
    expect((await db.get<{ dirty_json: string }>("SELECT dirty_json FROM equipment WHERE serial = ?", ["C1"]))?.dirty_json).toBe("[]");
  });
});

describe("odoo browser agent", () => {
  it("ingests a snapshot, archives a missing lead, and acks outbound without calling Odoo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { db } = await tempSql();
    const adapter = new OdooSyncAdapter();
    await expect(adapter.pullLeads()).rejects.toThrow(/not implemented/);
    const first = await ingestSnapshot(db, {
      mode: "full",
      leads: [
        { id: 10, name: "Hotel Norte", stage: "LEAD", active: true, wonStatus: "Pendiente" },
        { id: 11, name: "Hotel Sur", stage: "LEAD", active: true, wonStatus: "Ganado", activities: [{ summary: "Llamar", activityType: "Llamada" }] },
      ],
    });
    expect(first).toMatchObject({ inserted: 2, activities: 1, archived: 0 });
    const again = await ingestSnapshot(db, {
      mode: "full",
      leads: [{ id: 10, name: "Hotel Norte", stage: "OFERTA COMERCIAL", active: true }],
    });
    expect(again.updated).toBe(1);
    expect(again.archived).toBe(1);
    const archived = await db.get<{ active: number; missing_from_odoo: number; won_status: string }>(
      "SELECT active, missing_from_odoo, won_status FROM leads WHERE odoo_id = ?",
      ["11"],
    );
    expect(archived).toMatchObject({ active: 0, missing_from_odoo: 1, won_status: "Ganado" });

    await db.run("UPDATE leads SET sync_state = 'pending_create', import_key = ? WHERE odoo_id = ?", ["local:nuevo", "10"]);
    const outboundId = await queueOutbound(db, "create", "local:nuevo", {
      name: "Hotel Norte",
      customer: "",
      salesperson: "",
      team: "",
      stage: "LEAD",
      expectedRevenue: null,
      probability: null,
      expectedClose: null,
      type: "Oportunidad",
    });
    await expect(acknowledgeOutbound(db, outboundId, {})).rejects.toThrow(/id de Odoo/);
    const acked = await acknowledgeOutbound(db, outboundId, { odooId: 99 });
    expect(acked.odooId).toBe("99");
    expect((await db.get<{ odoo_id: string; sync_state: string }>("SELECT odoo_id, sync_state FROM leads WHERE import_key = ?", ["local:nuevo"]))?.odoo_id).toBe("99");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps Odoo stage labels onto the canvas names and keeps an unknown stage", () => {
    expect(canonicalStage("lead")).toBe("LEAD");
    expect(canonicalStage("  CONTACTO / visita / llamada en frío ")).toBe("CONTACTO/VISITA /LLAMADA EN FRIO");
    expect(canonicalStage("impactado")).toBe("IMPACTADO");
    expect(canonicalStage("PRESENTACION/DISCOVERY")).toBe("PRESENTACIÓN/DISCOVERY");
    expect(canonicalStage("oferta comercial")).toBe("OFERTA COMERCIAL");
    expect(canonicalStage("negociacion")).toBe("NEGOCIACIÓN");
    expect(canonicalStage("cierre / ganado")).toBe("CIERRE/ GANADO");
    expect(canonicalStage("cliente recurrente")).toBe("CLIENTE RECURRENTE");
    expect(canonicalStage("oportunidad perdida")).toBe("OPORTUNIDAD PERDIDA");
    expect(canonicalStage("  Etapa Fantasma  ")).toBe("Etapa Fantasma");
    expect(canonicalStage("")).toBe("");
  });

  it("links one Excel row by name, customer, and created day, and a dry run writes nothing", async () => {
    const { db } = await tempSql();
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status, salesperson, team)
       VALUES ('excel:1', 'Café Centro', 'LEAD', 'Hotel Luna', '2024-05-02', 1, 'Pendiente', '', '')`,
    );
    const preview = await ingestSnapshot(db, {
      mode: "full",
      snapshotId: "preview",
      dryRun: true,
      leads: [{ id: 50, name: "Café  Centro", customer: "hotel luna", createdAt: "2024-05-02T10:00:00", stage: "negociacion", active: true }],
    });
    expect(preview).toMatchObject({ dryRun: true, wouldLink: 1, wouldInsert: 0, wouldUpdate: 0, wouldArchive: 0, inserted: 0, linked: 0, updated: 0, archived: 0 });
    expect((await db.get<{ odoo_id: string | null }>("SELECT odoo_id FROM leads WHERE import_key = ?", ["excel:1"]))?.odoo_id ?? null).toBeNull();
    expect(await db.get("SELECT snapshot_id FROM odoo_snapshot_seen WHERE snapshot_id = ?", ["preview"])).toBeUndefined();
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM odoo_sync_log")).toMatchObject({ n: 0 });

    const linked = await ingestSnapshot(db, {
      mode: "incremental",
      leads: [{ id: 50, name: "Café  Centro", partner: "Hotel   Luna", created_at: "2024-05-02", stage: "negociacion", active: true }],
    });
    expect(linked).toMatchObject({ linked: 1, inserted: 0, updated: 0 });
    expect(await db.get<{ import_key: string; odoo_id: string; stage: string }>("SELECT import_key, odoo_id, stage FROM leads WHERE import_key = ?", ["excel:1"])).toMatchObject({
      import_key: "excel:1",
      odoo_id: "50",
      stage: "NEGOCIACIÓN",
    });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 1 });
  });

  it("links one local row when two share the same identity and keeps the other", async () => {
    const { db } = await tempSql();
    for (const key of ["excel:a", "excel:b"]) {
      await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES (?, 'Café Centro', 'LEAD', 'Hotel Luna', '2024-05-02', 1)`, [key]);
    }
    const result = await ingestSnapshot(db, {
      mode: "incremental",
      leads: [{ id: 50, name: "Cafe Centro", customer: "hotel luna", createdAt: "2024-05-02", stage: "LEAD" }],
    });
    expect(result).toMatchObject({ linked: 1, inserted: 0, errors: [] });
    expect(result.summary.linked).toBe(1);
    expect(result.summary.possibleDuplicates).toHaveLength(1);
    expect(result.summary.possibleDuplicates[0]?.linked.importKey).toBe("excel:a");
    expect(result.summary.possibleDuplicates[0]?.duplicates.map((row) => row.importKey)).toEqual(["excel:b"]);
    expect(result.summary.ambiguous[0]?.candidates.map((row) => row.importKey)).toEqual(["excel:a", "excel:b"]);
    expect(result.summary.unlinked).toEqual([]);
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 2 });
    expect(await db.get<{ odoo_id: string; active: number }>("SELECT odoo_id, active FROM leads WHERE import_key = 'excel:a'")).toMatchObject({ odoo_id: "50", active: 1 });
    expect(await db.get<{ odoo_id: string | null; active: number; missing_from_odoo: number }>("SELECT odoo_id, active, missing_from_odoo FROM leads WHERE import_key = 'excel:b'")).toMatchObject({
      odoo_id: null,
      active: 1,
      missing_from_odoo: 0,
    });
    expect(await db.get("SELECT import_key FROM leads WHERE import_key = 'odoo:50'")).toBeUndefined();
  });

  it("links Oportunidad de FEMSA to FEMSA and leaves an unmatched row out of the link", async () => {
    expect(normalizeLabel("Oportunidad de FEMSA")).toBe(normalizeLabel("FEMSA"));
    expect(normalizeLabel("Oportunidad de Café Bogotá S.A.S.")).toBe("cafebogotasas");
    const { db } = await tempSql();
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, tags) VALUES ('excel:femsa', 'Oportunidad de FEMSA', 'LEAD', 'FEMSA', '2026-06-17T15:54:00', 1, '')`,
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, tags) VALUES ('excel:keralty', 'Oportunidad de KERALTY S.A.S.', 'LEAD', 'KERALTY S.A.S.', '2026-09-15T15:54:00', 1, '')`,
    );
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active, tags) VALUES ('excel:hotel', 'HOTEL W', 'LEAD', '', '2026-09-01', 1, '')`);
    const preview = await ingestSnapshot(db, {
      mode: "full",
      dryRun: true,
      leads: [
        { id: 7, name: "FEMSA", customer: "FEMSA", createdAt: "2019-01-01", stage: "LEAD", active: true },
        { id: 8, name: "keralty sas", partner: "KERALTY SAS", stage: "NEGOCIACION", active: true },
      ],
    });
    expect(preview).toMatchObject({ wouldLink: 2, wouldInsert: 0, wouldArchive: 0, linked: 0, inserted: 0, archived: 0 });
    expect(preview.summary).toMatchObject({ linked: 2, ambiguousCount: 0, unlinkedCount: 1, missingLinkedCount: 0, possibleDuplicateCount: 0 });
    expect(preview.summary.unlinked).toEqual([{ importKey: "excel:hotel", name: "HOTEL W", customer: "" }]);
    expect(preview.summary.ambiguous).toEqual([]);
    expect(preview.summary.missingLinked).toEqual([]);
    expect((await db.get<{ odoo_id: string | null }>("SELECT odoo_id FROM leads WHERE import_key = 'excel:femsa'"))?.odoo_id ?? null).toBeNull();

    const live = await ingestSnapshot(db, {
      mode: "full",
      snapshotId: "odoo-femsa",
      leads: [
        { id: 7, name: "FEMSA", customer: "FEMSA", createdAt: "2019-01-01", stage: "LEAD", active: true },
        { id: 8, name: "keralty sas", partner: "KERALTY SAS", stage: "negociacion", active: true },
      ],
    });
    expect(live).toMatchObject({ linked: 2, inserted: 0, archived: 0 });
    expect(await db.get<{ odoo_id: string; import_key: string; active: number }>("SELECT odoo_id, import_key, active FROM leads WHERE import_key = 'excel:femsa'")).toMatchObject({
      odoo_id: "7",
      import_key: "excel:femsa",
      active: 1,
    });
    expect(await db.get<{ odoo_id: string; stage: string }>("SELECT odoo_id, stage FROM leads WHERE import_key = 'excel:keralty'")).toMatchObject({
      odoo_id: "8",
      stage: "NEGOCIACIÓN",
    });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 3 });
    const committed = await commitSnapshot(db, { snapshotId: "odoo-femsa" });
    expect(committed).toMatchObject({ seen: 2, archived: 0, missingLinkedCount: 0 });
    expect(await db.get<{ active: number; odoo_id: string }>("SELECT active, odoo_id FROM leads WHERE import_key = 'excel:femsa'")).toMatchObject({ active: 1, odoo_id: "7" });
    expect(await db.get<{ active: number; missing_from_odoo: number; odoo_id: string | null }>("SELECT active, missing_from_odoo, odoo_id FROM leads WHERE import_key = 'excel:hotel'")).toMatchObject({
      active: 1,
      missing_from_odoo: 0,
      odoo_id: null,
    });
  });

  it("links the oldest FEMSA row when several match and flags the rest", async () => {
    const { db } = await tempSql();
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:a', 'Oportunidad de FEMSA', 'LEAD', 'FEMSA', '2024-01-01', 1)`);
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:b', 'FEMSA', 'LEAD', 'FEMSA', '2024-06-01', 1)`);
    const preview = await ingestSnapshot(db, {
      mode: "full",
      dryRun: true,
      leads: [{ id: 7, name: "Oportunidad de FEMSA", customer: "FEMSA", stage: "LEAD", active: true }],
    });
    expect(preview).toMatchObject({ wouldLink: 1, wouldInsert: 0, wouldArchive: 0, linked: 0, inserted: 0 });
    expect(preview.summary.ambiguousCount).toBe(1);
    expect(preview.summary.possibleDuplicateCount).toBe(1);
    expect(preview.summary.possibleDuplicates[0]?.linked.importKey).toBe("excel:a");
    expect(preview.summary.possibleDuplicates[0]?.duplicates.map((row) => row.importKey)).toEqual(["excel:b"]);
    expect(preview.summary.ambiguous[0]?.candidates.map((row) => row.importKey)).toEqual(["excel:a", "excel:b"]);
    expect(preview.summary.unlinked).toEqual([]);
    expect(preview.summary.missingLinkedCount).toBe(0);
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 2 });

    const live = await ingestSnapshot(db, {
      mode: "full",
      leads: [{ id: 7, name: "Oportunidad de FEMSA", customer: "FEMSA", stage: "LEAD", active: true }],
    });
    expect(live).toMatchObject({ linked: 1, inserted: 0, archived: 0 });
    expect(await db.get<{ odoo_id: string; active: number }>("SELECT odoo_id, active FROM leads WHERE import_key = 'excel:a'")).toMatchObject({ odoo_id: "7", active: 1 });
    expect(await db.get<{ odoo_id: string | null; active: number; missing_from_odoo: number }>("SELECT odoo_id, active, missing_from_odoo FROM leads WHERE import_key = 'excel:b'")).toMatchObject({
      odoo_id: null,
      active: 1,
      missing_from_odoo: 0,
    });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 2 });
  });

  it("links the fuller local row when it is newer than a thinner duplicate", async () => {
    const { db } = await tempSql();
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status) VALUES ('excel:old', 'FEMSA', 'LEAD', 'FEMSA', '2020-01-01', 1, 'Pendiente')`);
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status, salesperson, tags, expected_revenue)
       VALUES ('excel:rich', 'Oportunidad de FEMSA', 'NEGOCIACIÓN', 'FEMSA', '2024-06-01', 1, 'Ganado', 'Ana', 'vip', 1000)`,
    );
    const preview = await ingestSnapshot(db, {
      mode: "full",
      dryRun: true,
      leads: [{ id: 7, name: "FEMSA", customer: "FEMSA", stage: "LEAD", active: true }],
    });
    expect(preview.summary.possibleDuplicates[0]?.linked.importKey).toBe("excel:rich");
    expect(preview.summary.possibleDuplicates[0]?.duplicates.map((row) => row.importKey)).toEqual(["excel:old"]);
    expect(preview).toMatchObject({ wouldLink: 1, wouldInsert: 0, wouldArchive: 0 });
  });

  it("links by name alone when the customer is empty on one side and the name is unique", async () => {
    const { db } = await tempSql();
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:hotel', 'HOTEL W', 'LEAD', '', '2026-09-01', 1)`);
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:cafe', 'Oportunidad de Café Centro', 'LEAD', 'Hotel Luna', '2024-05-02', 1)`);
    const linked = await ingestSnapshot(db, {
      mode: "incremental",
      leads: [
        { id: 3, name: "Oportunidad de HOTEL W", customer: "Cadena", stage: "LEAD", active: true },
        { id: 4, name: "Café Centro", partner_name: "", stage: "LEAD", active: true },
      ],
    });
    expect(linked).toMatchObject({ linked: 2, inserted: 0 });
    expect(await db.get<{ odoo_id: string }>("SELECT odoo_id FROM leads WHERE import_key = 'excel:hotel'")).toMatchObject({ odoo_id: "3" });
    expect(await db.get<{ odoo_id: string }>("SELECT odoo_id FROM leads WHERE import_key = 'excel:cafe'")).toMatchObject({ odoo_id: "4" });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 2 });
  });

  it("does not link by name alone when that name is shared or both customers are present", async () => {
    const { db } = await tempSql();
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:a', 'HOTEL W', 'LEAD', '', '2026-01-01', 1)`);
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:b', 'Oportunidad de HOTEL W', 'LEAD', '', '2026-02-01', 1)`);
    await db.run(`INSERT INTO leads (import_key, name, stage, customer, created_at, active) VALUES ('excel:femsa', 'FEMSA', 'LEAD', 'FEMSA', '2024-01-01', 1)`);
    const sharedLocal = await ingestSnapshot(db, {
      mode: "full",
      dryRun: true,
      leads: [{ id: 3, name: "Hotel W", customer: "Cadena", stage: "LEAD", active: true }],
    });
    expect(sharedLocal).toMatchObject({ wouldLink: 0, wouldInsert: 1, wouldArchive: 0 });
    expect(sharedLocal.summary.unlinked.map((row) => row.importKey).sort()).toEqual(["excel:a", "excel:b", "excel:femsa"]);

    const sharedIncoming = await ingestSnapshot(db, {
      mode: "incremental",
      leads: [
        { id: 3, name: "Hotel W", customer: "Cadena", stage: "LEAD", active: true },
        { id: 4, name: "HOTEL W", customer: "", stage: "LEAD", active: true },
        { id: 5, name: "FEMSA", customer: "Otra empresa", stage: "LEAD", active: true },
      ],
    });
    expect(sharedIncoming).toMatchObject({ linked: 0, inserted: 3 });
    expect(await db.get<{ odoo_id: string | null; active: number }>("SELECT odoo_id, active FROM leads WHERE import_key = 'excel:a'")).toMatchObject({ odoo_id: null, active: 1 });
    expect(await db.get<{ odoo_id: string | null; active: number }>("SELECT odoo_id, active FROM leads WHERE import_key = 'excel:b'")).toMatchObject({ odoo_id: null, active: 1 });
    expect(await db.get<{ odoo_id: string | null; active: number }>("SELECT odoo_id, active FROM leads WHERE import_key = 'excel:femsa'")).toMatchObject({ odoo_id: null, active: 1 });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 6 });
  });

  it("links by email or NIT when the names differ", async () => {
    const { db } = await tempSql();
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, tags) VALUES ('excel:mail', 'Habitaciones y Desayunos Hoteles Estelar', 'LEAD', 'miguel.diez@hotelesestelar.com', '2024-02-01', 1, 'Hoteles')`,
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, tags) VALUES ('excel:nit', 'INNOMATIK SAS  Nit: 900791766-0', 'LEAD', 'INNOMATIK SAS', '2024-03-01', 1, '')`,
    );
    const linked = await ingestSnapshot(db, {
      mode: "incremental",
      leads: [
        { id: 21, name: "Hoteles Estelar", customer: "Hoteles Estelar", email: "Miguel.Diez@HotelesEstelar.com", stage: "LEAD", active: true },
        { id: 22, name: "Innomatik", customer: "Otro comercio", nit: "900791766", stage: "LEAD", active: true },
      ],
    });
    expect(linked).toMatchObject({ linked: 2, inserted: 0 });
    expect(await db.get<{ odoo_id: string }>("SELECT odoo_id FROM leads WHERE import_key = 'excel:mail'")).toMatchObject({ odoo_id: "21" });
    expect(await db.get<{ odoo_id: string }>("SELECT odoo_id FROM leads WHERE import_key = 'excel:nit'")).toMatchObject({ odoo_id: "22" });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 2 });
  });

  it("previews a full archive without writing it", async () => {
    const { db } = await tempSql();
    await ingestSnapshot(db, { mode: "full", leads: [{ id: 1, name: "A", stage: "LEAD", active: true }] });
    const preview = await ingestSnapshot(db, { mode: "full", dryRun: true, leads: [{ id: 2, name: "B", stage: "LEAD", active: true }] });
    expect(preview).toMatchObject({ wouldInsert: 1, wouldArchive: 1, inserted: 0, archived: 0 });
    expect(preview.summary.missingLinkedCount).toBe(1);
    expect(preview.summary.missingLinked.map((row) => row.odooId)).toEqual(["1"]);
    expect((await db.get<{ active: number }>("SELECT active FROM leads WHERE odoo_id = ?", ["1"]))?.active).toBe(1);
    expect(await db.get("SELECT import_key FROM leads WHERE odoo_id = ?", ["2"])).toBeUndefined();
  });

  it("keeps every batch until commit, then archives leads missing from the snapshot", async () => {
    const { db } = await tempSql();
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status, odoo_id)
       VALUES ('odoo:12', 'Hotel Viejo', 'LEAD', 'Viejo', '2024-01-01', 1, 'Ganado', '12')`,
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status)
       VALUES ('excel:solo', 'Sin par', 'LEAD', 'Nadie', '2020-01-01', 1, 'Pendiente')`,
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, active, sync_state, won_status)
       VALUES ('local:nuevo', 'Borrador', 'LEAD', 1, 'pending_create', 'Pendiente')`,
    );
    const first = await ingestSnapshot(db, {
      mode: "full",
      snapshotId: "odoo-2026-10-19",
      capturedAt: "2026-10-19T22:00:00.000Z",
      leads: [{ id: 10, name: "Hotel Norte", stage: "Etapa Fantasma", active: true, wonStatus: "Pendiente" }],
    });
    expect(first).toMatchObject({ inserted: 1, archived: 0, wouldArchive: 0 });
    expect((await db.get<{ stage: string; active: number }>("SELECT stage, active FROM leads WHERE odoo_id = ?", ["10"]))?.stage).toBe("Etapa Fantasma");
    expect((await db.get<{ active: number }>("SELECT active FROM leads WHERE odoo_id = ?", ["12"]))?.active).toBe(1);

    const second = await ingestSnapshot(db, {
      mode: "full",
      snapshotId: "odoo-2026-10-19",
      leads: [{ id: 11, name: "Hotel Sur", stage: "PRESENTACION/DISCOVERY", active: true, wonStatus: "Pendiente" }],
    });
    expect(second).toMatchObject({ inserted: 1, archived: 0 });
    expect((await db.get<{ stage: string }>("SELECT stage FROM leads WHERE odoo_id = ?", ["11"]))?.stage).toBe("PRESENTACIÓN/DISCOVERY");

    await expect(ingestSnapshot(db, { mode: "incremental", snapshotId: "odoo-2026-10-19", leads: [] })).rejects.toThrow(/snapshotId/);

    const preview = await commitSnapshot(db, { snapshotId: "odoo-2026-10-19", dryRun: true });
    expect(preview).toMatchObject({ seen: 2, archived: 0, wouldArchive: 1, missingLinkedCount: 1, dryRun: true });
    expect((await db.get<{ active: number }>("SELECT active FROM leads WHERE odoo_id = ?", ["12"]))?.active).toBe(1);

    const committed = await commitSnapshot(db, { snapshotId: "odoo-2026-10-19" });
    expect(committed).toMatchObject({ seen: 2, archived: 1, wouldArchive: 1, missingLinkedCount: 1 });
    expect(
      await db.get<{ active: number; missing_from_odoo: number; won_status: string }>("SELECT active, missing_from_odoo, won_status FROM leads WHERE odoo_id = ?", ["12"]),
    ).toMatchObject({ active: 0, missing_from_odoo: 1, won_status: "Ganado" });
    expect(
      await db.get<{ active: number; missing_from_odoo: number; odoo_id: string | null }>("SELECT active, missing_from_odoo, odoo_id FROM leads WHERE import_key = ?", ["excel:solo"]),
    ).toMatchObject({ active: 1, missing_from_odoo: 0, odoo_id: null });
    expect(
      await db.get<{ active: number; missing_from_odoo: number; sync_state: string }>("SELECT active, missing_from_odoo, sync_state FROM leads WHERE import_key = ?", ["local:nuevo"]),
    ).toMatchObject({ active: 1, missing_from_odoo: 0, sync_state: "pending_create" });
    await expect(commitSnapshot(db, { snapshotId: "odoo-2026-10-19" })).rejects.toThrow(/no tiene leads/);
    await expect(commitSnapshot(db, {})).rejects.toThrow(/Falta snapshotId/);
  });

  it("ingests and commits 1000 leads with a bounded number of D1 calls", async () => {
    const { db } = await tempSql();
    const seed = Array.from({ length: 1000 }, (_, i) => ({
      sql: "INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status, salesperson, team) VALUES (?, ?, 'LEAD', ?, '2024-06-01', 1, 'Pendiente', '', '')",
      params: [`excel:${i}`, `Oportunidad ${i}`, `Cliente ${i}`],
    }));
    seed.push({
      sql: "INSERT INTO leads (import_key, name, stage, active, sync_state, won_status) VALUES ('local:nuevo', 'Borrador', 'LEAD', 1, 'pending_create', 'Pendiente')",
      params: [],
    });
    await db.batch(seed);
    const leads = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      name: `oportunidad  ${i}`,
      customer: `CLIENTE ${i}`,
      createdAt: "2024-06-01T08:00:00",
      stage: "negociacion",
      active: true,
      ...(i % 10 === 0 ? { activities: [{ summary: "Llamar", activityType: "Llamada" }] } : {}),
    }));

    const preview = counting(db);
    const dry = await ingestSnapshot(preview.tracked, { mode: "full", snapshotId: "bulk", dryRun: true, leads });
    expect(dry).toMatchObject({ wouldLink: 1000, wouldInsert: 0, wouldArchive: 0, inserted: 0, linked: 0, activities: 100 });
    expect(preview.calls).toBeLessThanOrEqual(3);
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM odoo_snapshot_seen")).toMatchObject({ n: 0 });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities")).toMatchObject({ n: 0 });

    const live = counting(db);
    const written = await ingestSnapshot(live.tracked, { mode: "full", snapshotId: "bulk", leads });
    expect(written).toMatchObject({ linked: 1000, inserted: 0, archived: 0, activities: 100 });
    expect(live.calls).toBeLessThan(40);
    expect(live.calls).toBeLessThan(leads.length / 10);
    expect(live.sizes.length).toBeGreaterThan(0);
    expect(Math.max(...live.sizes)).toBeLessThanOrEqual(SQL_BATCH_LIMIT);
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads")).toMatchObject({ n: 1001 });
    expect(await db.get<{ stage: string; odoo_id: string; import_key: string }>("SELECT stage, odoo_id, import_key FROM leads WHERE import_key = 'excel:0'")).toMatchObject({
      stage: "NEGOCIACIÓN",
      odoo_id: "1",
      import_key: "excel:0",
    });
    expect(await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities")).toMatchObject({ n: 100 });
    expect((await db.get<{ lead_import_key: string }>("SELECT lead_import_key FROM activities WHERE odoo_lead_id = '1'"))?.lead_import_key).toBe("excel:0");

    await db.batch(
      Array.from({ length: 1000 }, (_, i) => ({
        sql: "INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status, odoo_id) VALUES (?, ?, 'LEAD', 'Nadie', '2020-01-01', 1, ?, ?)",
        params: [`extra:${i}`, `Extra ${i}`, i === 0 ? "Ganado" : "Pendiente", `x${i}`],
      })),
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, customer, created_at, active, won_status) VALUES ('excel:never', 'Nunca', 'LEAD', 'Nadie', '2020-01-01', 1, 'Pendiente')`,
    );
    const commit = counting(db);
    const committed = await commitSnapshot(commit.tracked, { snapshotId: "bulk" });
    expect(committed).toMatchObject({ seen: 1000, archived: 1000, missingLinkedCount: 1000 });
    expect(commit.calls).toBeLessThan(40);
    expect(commit.sizes.length).toBeGreaterThan(0);
    expect(Math.max(...commit.sizes)).toBeLessThanOrEqual(SQL_BATCH_LIMIT);
    expect(await db.get<{ active: number; won_status: string; missing_from_odoo: number }>("SELECT active, won_status, missing_from_odoo FROM leads WHERE import_key = 'extra:0'")).toMatchObject({
      active: 0,
      won_status: "Ganado",
      missing_from_odoo: 1,
    });
    expect(await db.get<{ active: number; sync_state: string }>("SELECT active, sync_state FROM leads WHERE import_key = 'local:nuevo'")).toMatchObject({
      active: 1,
      sync_state: "pending_create",
    });
    expect(await db.get<{ active: number }>("SELECT active FROM leads WHERE import_key = 'excel:1'")).toMatchObject({ active: 1 });
    expect(await db.get<{ active: number; missing_from_odoo: number; odoo_id: string | null }>("SELECT active, missing_from_odoo, odoo_id FROM leads WHERE import_key = 'excel:never'")).toMatchObject({
      active: 1,
      missing_from_odoo: 0,
      odoo_id: null,
    });
  });
});

function counting(db: SqlDb) {
  const state = { calls: 0, sizes: [] as number[] };
  const tracked: SqlDb = {
    kind: "sql",
    async exec(sql) {
      state.calls += 1;
      return db.exec(sql);
    },
    async get(sql, params) {
      state.calls += 1;
      return db.get(sql, params);
    },
    async all(sql, params) {
      state.calls += 1;
      return db.all(sql, params);
    },
    async run(sql, params) {
      state.calls += 1;
      return db.run(sql, params);
    },
    async batch(statements) {
      state.calls += 1;
      state.sizes.push(statements.length);
      return db.batch(statements);
    },
  };
  return { tracked, get calls() { return state.calls; }, get sizes() { return state.sizes; } };
}
