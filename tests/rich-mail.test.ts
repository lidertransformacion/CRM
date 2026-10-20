import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/auth/users";
import { buildCommitteeEmail } from "@/lib/committee/email";
import { buildSeedCommittee } from "@/lib/committee/seed-data";
import { openDatabase } from "@/lib/db";
import { saveMailFile } from "@/lib/mail/files";
import { htmlToText, sanitizeEmailHtml, toEditorHtml } from "@/lib/mail/html";
import { rfc822 } from "@/lib/mail/message";
import { enqueueEmail, processOutbox } from "@/lib/mail/outbox";
import { wrapDatabaseSync } from "@/lib/sql/node";

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-rich-mail-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

describe("rich mail", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
  });

  it("keeps committee tables and strips scripts", () => {
    const email = buildCommitteeEmail(buildSeedCommittee(), "2026-10-15");
    const dirty = `${email.html}<script>alert(1)</script><img src="javascript:alert(1)"><a href="javascript:alert(1)" onclick="x()">enlace</a>`;
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).toContain("<table");
    expect(clean).toContain("background: #fde8e8");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("onclick");
    expect(toEditorHtml("Hola\n\nEquipo")).toBe("<p>Hola</p><p>Equipo</p>");
    expect(htmlToText("<p>Hola</p><p><strong>Equipo</strong></p>")).toContain("Hola");
  });

  it("builds multipart/mixed with an inline image and a document", () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const raw = rfc822({
      to: "equipo@libertariocoffee.com",
      subject: "Comité",
      text: "Hola",
      html: '<p>Foto</p><img src="cid:foto@crm.libertario"><table><tr style="background:#fde8e8"><td>Rojo</td></tr></table>',
      parts: [
        { filename: "foto.png", contentType: "image/png", bytes: png, contentId: "foto@crm.libertario", inline: true },
        { filename: "oferta.pdf", contentType: "application/pdf", bytes: pdf, inline: false },
      ],
      fromAddress: "lidertransformacion@libertariocoffee.com",
      fromName: "Comercial Libertario",
    });
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain("multipart/related");
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("Content-ID: <foto@crm.libertario>");
    expect(raw).toContain("Content-Disposition: inline");
    expect(raw).toContain('filename="oferta.pdf"');
    expect(raw).toContain("Content-Disposition: attachment");
    expect(raw).toContain("background:#fde8e8");
    expect(raw).not.toContain("To: cliente@hotel.com");
  });

  it("stores a small file without R2 and sends it as cid", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const sender = await createUser(db, { role: "admin" }, { email: "archivos.mail@libertariocoffee.com", password: "correct-horse-battery" });
    const saved = await saveMailFile(db, sender.id, { filename: "logo.png", contentType: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) });
    expect(saved.r2_key).toBeNull();
    expect(saved.data_base64).toBeTruthy();
    const doc = await saveMailFile(db, sender.id, { filename: "plan.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: new Uint8Array([5, 6]) });
    await enqueueEmail(db, {
      to: "cliente@hotel.com",
      subject: "Con archivos",
      body: "Texto",
      html: `<p>Logo</p><img src="/api/mail/files/${saved.id}" data-file-id="${saved.id}">`,
      attachmentIds: [doc.id],
      senderUserId: sender.id,
    });
    const seen: string[] = [];
    const row = await db.get<{ id: number }>("SELECT id FROM email_outbox WHERE subject = 'Con archivos'");
    await processOutbox(db, {
      ids: [row!.id],
      deliver: async (input) => {
        seen.push(rfc822({
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          parts: input.parts,
          fromAddress: "lidertransformacion@libertariocoffee.com",
          fromName: "Comercial",
        }));
        return "ok";
      },
    });
    expect(seen[0]).toContain(`cid:${saved.content_id}`);
    expect(seen[0]).toContain("multipart/mixed");
    expect(seen[0]).toContain("plan.docx");
    expect(seen[0]).not.toContain("/api/mail/files/");
  });
});
