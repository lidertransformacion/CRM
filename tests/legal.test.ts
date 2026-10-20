import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { normalizeRole, signSession, verifySession } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/users";
import { openDatabase } from "@/lib/db";
import type { Actor } from "@/lib/legal/access";
import { sellerMatchesUser } from "@/lib/legal/access";
import { auditCanonical, recordAudit } from "@/lib/legal/audit";
import { addNovedad, createContract, isExpiring, listContracts } from "@/lib/legal/contracts";
import { assertPdfUpload, createFolder, deleteFile, deleteFolder, moveFolder, renameFolder, uploadDriveFile } from "@/lib/legal/drive";
import { setLegalFilesBucketForTests, sha256Hex, sha256Text, type LegalBucket } from "@/lib/legal/storage";
import { COMMERCIAL_ROLE_SQL } from "@/lib/schema";
import { wrapDatabaseSync } from "@/lib/sql/node";
import type { SqlDb } from "@/lib/sql/types";

const SECRET = "test-session-secret-value";

class MemoryBucket implements LegalBucket {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer | Uint8Array | string) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, bytes.slice());
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      size: bytes.byteLength,
      body: new ReadableStream(),
      httpMetadata: { contentType: "application/pdf" },
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      },
    };
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

function actor(id: number, role: Actor["role"], email: string): Actor {
  return { uid: id, email, role, ip: "203.0.113.8", userAgent: "vitest" };
}

async function tempDb() {
  const file = path.join(os.tmpdir(), `crm-legal-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

async function seed(db: SqlDb) {
  const now = "2026-10-20T12:00:00.000Z";
  const password = await hashPassword("correct-horse-battery");
  const insert = async (email: string, role: string) => {
    const result = await db.run(
      `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, 1, ?, ?)`,
      [email, password, role, now, now],
    );
    return result.lastInsertRowid;
  };
  const adminId = await insert("admin@libertariocoffee.com", "admin");
  const comercialId = await insert("ana.comercial@libertariocoffee.com", "comercial");
  const legalId = await insert("legal@libertariocoffee.com", "legal");
  const gerenciaId = await insert("gerencia@libertariocoffee.com", "gerencia");
  await db.run(
    `INSERT INTO leads (import_key, name, stage, salesperson, customer, active, edited_locally, sync_state, missing_from_odoo)
     VALUES ('L1', 'Negocio norte', 'Nuevo', 'ana.comercial@libertariocoffee.com', 'Cafe Norte', 1, 0, 'synced', 0)`,
  );
  await db.run(
    `INSERT INTO leads (import_key, name, stage, salesperson, customer, active, edited_locally, sync_state, missing_from_odoo)
     VALUES ('L2', 'Negocio sur', 'Nuevo', 'Otro Vendedor', 'Cafe Sur', 1, 0, 'synced', 0)`,
  );
  await db.run(
    `INSERT INTO equipment (serial, asset_number, name, category, site_id, site_seq, store_code, warranty_state, status, salesperson, lead_import_key, created_at, updated_at)
     VALUES ('EQ1', 'A-1', 'Maquina', 'Espresso', 'site', 1, 'T01', 'ok', 'active', 'Ana Comercial', 'L1', ?, ?)`,
    [now, now],
  );
  return {
    admin: actor(adminId, "admin", "admin@libertariocoffee.com"),
    comercial: actor(comercialId, "comercial", "ana.comercial@libertariocoffee.com"),
    legal: actor(legalId, "legal", "legal@libertariocoffee.com"),
    gerencia: actor(gerenciaId, "gerencia", "gerencia@libertariocoffee.com"),
  };
}

describe("legal roles", () => {
  it("treats the old user role as comercial and keeps one permission set", () => {
    expect(normalizeRole("user")).toBe("comercial");
    expect(can("user", "view_contracts")).toBe(true);
    expect(can("comercial", "manage_files")).toBe(false);
    expect(can("comercial", "upload_contract")).toBe(true);
    expect(can("legal", "manage_files")).toBe(true);
    expect(can("gerencia", "upload_contract")).toBe(false);
    expect(can("gerencia", "view_gerencia")).toBe(true);
    expect(can("admin", "manage_users")).toBe(true);
    expect(sellerMatchesUser("Murillo Valencia, Santiago", "santiago.murillo@libertariocoffee.com")).toBe(true);
    expect(sellerMatchesUser("Otro Vendedor", "ana.comercial@libertariocoffee.com")).toBe(false);
  });

  it("accepts an old session cookie whose role is user", async () => {
    process.env.SESSION_SECRET = SECRET;
    const token = await signSession({
      uid: 4,
      email: "ana.comercial@libertariocoffee.com",
      role: "user" as "comercial",
      mustChangePassword: false,
      sv: 1,
    });
    const session = await verifySession(token);
    expect(session?.role).toBe("comercial");
  });
});

describe("legal drive and contracts", () => {
  const created: string[] = [];
  const bucket = new MemoryBucket();

  afterEach(() => {
    setLegalFilesBucketForTests(null);
    for (const file of created) fs.rmSync(file, { force: true });
    created.length = 0;
  });

  it("renames the stored user role and chains audit hashes", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    const now = "2026-10-20T12:00:00.000Z";
    await db.run(
      `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
       VALUES ('old@libertariocoffee.com', 'x', 'user', 0, 0, 1, ?, ?)`,
      [now, now],
    );
    await db.exec(COMMERCIAL_ROLE_SQL);
    const row = await db.get<{ role: string }>("SELECT role FROM users WHERE email = 'old@libertariocoffee.com'");
    expect(row?.role).toBe("comercial");

    const first = await recordAudit(db, {
      entityType: "folder",
      entityId: 1,
      action: "folder.create",
      actorUserId: 1,
      actorEmail: "legal@libertariocoffee.com",
      ip: "203.0.113.8",
      userAgent: "vitest",
      data: { name: "Contratos" },
    }, now);
    const second = await recordAudit(db, {
      entityType: "folder",
      entityId: 1,
      action: "folder.rename",
      actorUserId: 1,
      actorEmail: "legal@libertariocoffee.com",
      ip: "203.0.113.8",
      userAgent: "vitest",
    }, "2026-10-20T12:05:00.000Z");
    expect(second.prevHash).toBe(first.hash);
    const stored = await db.all<{
      action: string;
      actor_email: string | null;
      actor_user_id: number | null;
      created_at: string;
      data_json: string | null;
      entity_id: number;
      entity_type: string;
      ip: string | null;
      prev_hash: string;
      user_agent: string | null;
      hash: string;
    }>("SELECT * FROM audit_events ORDER BY id");
    expect(await sha256Text(auditCanonical(stored[0]))).toBe(stored[0].hash);
    expect(await sha256Text(auditCanonical(stored[1]))).toBe(stored[1].hash);
    expect(stored[1].prev_hash).toBe(stored[0].hash);
  });

  it("manages folders and stores a hashed PDF without writing the bytes to D1", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    setLegalFilesBucketForTests(bucket);
    const people = await seed(db);
    await expect(createFolder(db, people.comercial, null, "Privado")).rejects.toMatchObject({ status: 403 });
    const root = await createFolder(db, people.legal, null, "Plantillas");
    const child = await createFolder(db, people.legal, root.id, "2026");
    await expect(createFolder(db, people.legal, root.id, "2026")).rejects.toBeInstanceOf(HttpError);
    await renameFolder(db, people.admin, child.id, "2027");
    await expect(moveFolder(db, people.legal, root.id, child.id)).rejects.toMatchObject({ status: 400 });
    await expect(deleteFolder(db, people.legal, root.id)).rejects.toMatchObject({ status: 400 });
    await moveFolder(db, people.legal, child.id, null);
    await deleteFolder(db, people.legal, root.id);

    const bytes = new TextEncoder().encode("%PDF-1.4 contrato");
    expect(() => assertPdfUpload("nota.txt", "text/plain", 10)).toThrow(HttpError);
    expect(() => assertPdfUpload("grande.pdf", "application/pdf", 25 * 1024 * 1024 + 1)).toThrow(HttpError);
    const stored = await uploadDriveFile(db, people.legal, { name: "modelo.pdf", mime: "application/pdf", bytes, folderId: child.id });
    expect(stored.sha256).toBe(await sha256Hex(bytes));
    expect(bucket.objects.get(stored.r2_key)).toEqual(bytes);
    const raw = await db.get<{ blob: unknown }>("SELECT r2_key AS blob FROM files WHERE id = ?", [stored.id]);
    expect(String(raw?.blob)).toMatch(/^files\//);
    await expect(uploadDriveFile(db, people.comercial, { name: "otro.pdf", mime: "application/pdf", bytes })).rejects.toMatchObject({ status: 403 });
  });

  it("links a contract to a deal and equipment, keeps signer order, and blocks other deals", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    setLegalFilesBucketForTests(bucket);
    const people = await seed(db);
    const bytes = new TextEncoder().encode("%PDF-1.4 firmado");
    await expect(
      createContract(db, people.comercial, {
        title: "Comodato norte",
        type: "comodato",
        status: "signed",
        counterparty_name: "Cafe Norte",
        fileName: "norte.pdf",
        mime: "application/pdf",
        bytes,
        links: [{ target_type: "lead", target_key: "L2" }],
        signers: [],
      }),
    ).rejects.toMatchObject({ status: 403 });

    const id = await createContract(db, people.comercial, {
      title: "Comodato norte",
      type: "comodato",
      status: "signed",
      counterparty_name: "Cafe Norte",
      country: "CO",
      end_date: "2026-10-25",
      renewal_notice_days: 30,
      fileName: "norte.pdf",
      mime: "application/pdf",
      bytes,
      links: [
        { target_type: "lead", target_key: "L1" },
        { target_type: "equipment", target_key: "EQ1" },
      ],
      signers: [
        { role: "comercial", signer_email: people.comercial.email, signer_name: "Ana", signer_user_id: people.comercial.uid },
        { role: "externo", signer_email: "compras@cafenorte.com", signer_name: "Cafe Norte" },
      ],
    });
    const links = await db.all<{ target_type: string; target_key: string }>("SELECT target_type, target_key FROM contract_links WHERE contract_id = ? ORDER BY target_type", [id]);
    expect(links).toEqual([
      { target_type: "equipment", target_key: "EQ1" },
      { target_type: "lead", target_key: "L1" },
    ]);
    const signers = await db.all<{ step_order: number; role: string; signer_user_id: number | null }>(
      "SELECT step_order, role, signer_user_id FROM contract_signers WHERE contract_id = ? ORDER BY step_order",
      [id],
    );
    expect(signers).toEqual([
      { step_order: 1, role: "comercial", signer_user_id: people.comercial.uid },
      { step_order: 2, role: "externo", signer_user_id: null },
    ]);
    const fileRow = await db.get<{ kind: string; sha256: string }>("SELECT kind, sha256 FROM files WHERE id = (SELECT current_file_id FROM contracts WHERE id = ?)", [id]);
    expect(fileRow?.kind).toBe("contract_signed");
    expect(fileRow?.sha256).toBe(await sha256Hex(bytes));
    const noteId = await addNovedad(db, people.comercial, id, { kind: "nota", body: "Ya estaba firmado al subirlo." });
    expect(noteId).toBeGreaterThan(0);
    await expect(addNovedad(db, people.gerencia, id, { kind: "nota", body: "No" })).rejects.toMatchObject({ status: 403 });
    const today = "2026-10-20";
    const rows = await listContracts(db, people.gerencia, "norte");
    expect(rows).toHaveLength(1);
    expect(isExpiring(rows[0], today)).toBe(true);
    const signed = await db.get<{ id: number }>("SELECT current_file_id AS id FROM contracts WHERE id = ?", [id]);
    await expect(deleteFile(db, people.legal, Number(signed?.id))).rejects.toMatchObject({ status: 403 });
    await deleteFile(db, people.admin, Number(signed?.id));
    expect(bucket.objects.size).toBeGreaterThan(0);
    const requests = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM signature_requests");
    expect(requests?.n).toBe(0);
  });
});
