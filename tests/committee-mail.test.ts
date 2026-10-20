import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/auth/users";
import { buildSeedCommittee } from "@/lib/committee/seed-data";
import { sendCommitteeSummary } from "@/lib/committee/send";
import { openDatabase } from "@/lib/db";
import { createFavorite, deleteFavorite, listFavorites } from "@/lib/mail/favorites";
import { applyTestRedirect, rfc822 } from "@/lib/mail/message";
import { enqueueEmail, processOutbox } from "@/lib/mail/outbox";
import { wrapDatabaseSync } from "@/lib/sql/node";

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-committee-mail-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

describe("committee summary mail", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
  });

  it("keeps CC out of the test-mode message and in the RFC header otherwise", () => {
    const redirected = applyTestRedirect(
      {
        to: "equipo@libertariocoffee.com, otra@libertariocoffee.com",
        cc: "copia@libertariocoffee.com",
        subject: "Comité",
        text: "Hola",
        html: "<table><tr style=\"background:#fde8e8\"><td>Rojo</td></tr></table>",
        fromAddress: "lidertransformacion@libertariocoffee.com",
        fromName: "Comercial Libertario",
      },
      "lidertransformacion@libertariocoffee.com",
    );
    expect(redirected.to).toBe("lidertransformacion@libertariocoffee.com");
    expect(redirected.cc).toBeUndefined();
    expect(redirected.text).toContain("Destinatario original: equipo@libertariocoffee.com, otra@libertariocoffee.com");
    expect(redirected.text).toContain("Copia original: copia@libertariocoffee.com");
    expect(redirected.html).toContain("background:#fde8e8");
    const raw = rfc822(redirected);
    expect(raw).not.toContain("Cc:");
    expect(raw).not.toContain("To: equipo@libertariocoffee.com");
    const live = rfc822({
      to: "equipo@libertariocoffee.com",
      cc: "copia@libertariocoffee.com",
      subject: "Comité",
      text: "Hola",
      html: "<p>Hola</p>",
      fromAddress: "lidertransformacion@libertariocoffee.com",
      fromName: "Comercial Libertario",
    });
    expect(live).toContain("Cc: copia@libertariocoffee.com");
    expect(live).toContain("<p>Hola</p>");
  });

  it("stores favorites per user and refuses another user's delete", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const owner = await createUser(db, { role: "admin" }, { email: "dueno.favoritos@libertariocoffee.com", password: "correct-horse-battery" });
    const other = await createUser(db, { role: "admin" }, { email: "otra.persona@libertariocoffee.com", password: "correct-horse-battery" });
    const favorite = await createFavorite(db, owner.id, {
      name: "Comité semanal",
      to: ["Juan.Pa@libertariocoffee.com", "juan.pa@libertariocoffee.com"],
      cc: ["Copia@libertariocoffee.com"],
    });
    expect(favorite.to).toEqual(["juan.pa@libertariocoffee.com"]);
    expect(favorite.cc).toEqual(["copia@libertariocoffee.com"]);
    expect(await listFavorites(db, other.id)).toEqual([]);
    await expect(deleteFavorite(db, other.id, favorite.id)).rejects.toMatchObject({ status: 404 });
    expect((await listFavorites(db, owner.id)).map((item) => item.name)).toEqual(["Comité semanal"]);
    await deleteFavorite(db, owner.id, favorite.id);
    expect(await listFavorites(db, owner.id)).toEqual([]);
  });

  it("queues the HTML summary, keeps red rows, and logs the attempt", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const sender = await createUser(db, { role: "admin" }, { email: "envia.comite@libertariocoffee.com", password: "correct-horse-battery" });
    const doc = buildSeedCommittee();
    await db.run(
      `INSERT INTO committee_docs (number, held_on, is_current, payload, created_at) VALUES (?, ?, 1, ?, ?)`,
      [doc.committee.number, doc.committee.heldOn, JSON.stringify(doc), new Date().toISOString()],
    );
    const result = await sendCommitteeSummary(db, sender.id, {
      committeeNumber: doc.committee.number,
      to: ["Equipo.Uno@libertariocoffee.com"],
      cc: ["Equipo.Dos@libertariocoffee.com"],
      asOf: "2026-10-15",
    });
    expect(result.status).toBe("queued");
    expect(result.testMode).toBe(true);
    expect(result.mode).toBe("log");
    const stored = await db.get<{ body_html: string; cc_email: string; to_email: string; sender_user_id: number; subject: string }>(
      "SELECT body_html, cc_email, to_email, sender_user_id, subject FROM email_outbox WHERE id = ?",
      [result.outboxId],
    );
    expect(stored?.subject).toBe("Comité Out of Stores · 14 oct · Decisiones y pendientes");
    expect(stored?.body_html).toContain("background:#fde8e8");
    expect(stored?.body_html).toContain("<table");
    expect(stored?.to_email).toBe("equipo.uno@libertariocoffee.com");
    expect(stored?.cc_email).toBe("equipo.dos@libertariocoffee.com");
    expect(stored?.sender_user_id).toBe(sender.id);
    const log = await db.get<{ status: string; test_mode: number; committee_number: number }>(
      "SELECT status, test_mode, committee_number FROM committee_email_log WHERE id = ?",
      [result.logId],
    );
    expect(log).toEqual({ status: "queued", test_mode: 1, committee_number: doc.committee.number });

    const seen: { html?: string; cc?: string; to: string }[] = [];
    await enqueueEmail(db, {
      to: ["equipo.uno@libertariocoffee.com"],
      cc: ["equipo.dos@libertariocoffee.com"],
      subject: "Otra",
      body: "Texto",
      html: stored?.body_html,
      senderUserId: sender.id,
    });
    const pending = await db.get<{ id: number }>("SELECT id FROM email_outbox WHERE subject = 'Otra'");
    await processOutbox(db, {
      ids: [pending!.id],
      deliver: async (input) => {
        seen.push({ html: input.html, cc: input.cc, to: input.to });
        return "test-provider";
      },
    });
    expect(seen[0]?.html).toContain("background:#fde8e8");
    expect(seen[0]?.cc).toBe("equipo.dos@libertariocoffee.com");
    expect(seen[0]?.to).toBe("equipo.uno@libertariocoffee.com");
  });
});
