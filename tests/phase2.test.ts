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
import { ingestSnapshot } from "@/lib/odoo/ingest";
import { acknowledgeOutbound, queueOutbound } from "@/lib/odoo/outbound";
import { googleAccessToken, signServiceAccountJwt } from "@/lib/sheets/live";
import { applySnapshot, pullFromSheet, rememberPush } from "@/lib/sheets/sync";
import { wrapDatabaseSync } from "@/lib/sql/node";
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
});
