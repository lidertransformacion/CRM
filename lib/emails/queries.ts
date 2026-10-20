import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import type { EmailTemplate } from "@/lib/emails/templates";
import { sanitizeEmailHtml } from "@/lib/mail/html";
import type { SqlDb } from "@/lib/sql/types";

/** Resumen de una oportunidad con lo que necesita un borrador de correo. */
export type LeadSummary = {
  import_key: string;
  name: string;
  customer: string;
  salesperson: string;
  stage: string;
  expected_revenue: number | null;
};

async function sqlOf(db?: SqlDb): Promise<SqlDb> {
  return db ?? (await getDb());
}

/** Plantillas de correo guardadas en la base, en el orden en que se muestran. */
export async function listEmailTemplates(db?: SqlDb): Promise<EmailTemplate[]> {
  const rows = await (await sqlOf(db)).all<{ id: string; name: string; subject: string; body: string; sort_order: number }>(
    "SELECT id, name, subject, body, sort_order FROM email_templates ORDER BY sort_order",
  );
  return rows.map((row) => ({ id: row.id, name: row.name, subject: row.subject, body: row.body, sortOrder: row.sort_order }));
}

export async function updateEmailTemplate(
  db: SqlDb,
  id: string,
  input: { subject: string; body: string },
): Promise<EmailTemplate> {
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new HttpError(400, "Plantilla inválida.");
  const subject = input.subject.replace(/\s+/g, " ").trim();
  if (!subject || subject.length > 200) throw new HttpError(400, "El asunto es obligatorio.");
  const body = sanitizeEmailHtml(input.body);
  const result = await db.run("UPDATE email_templates SET subject = ?, body = ? WHERE id = ?", [subject, body, id]);
  if (!result.changes) throw new HttpError(404, "Esa plantilla no está.");
  const saved = (await listEmailTemplates(db)).find((item) => item.id === id);
  if (!saved) throw new HttpError(404, "Esa plantilla no está.");
  return saved;
}

/** Busca una oportunidad por su import_key (el deep link `/correos?lead=` lo usa). */
export async function findLeadByKey(importKey: string, db?: SqlDb): Promise<LeadSummary | null> {
  const row = await (await sqlOf(db)).get<LeadSummary>(
    "SELECT import_key, name, customer, salesperson, stage, expected_revenue FROM leads WHERE import_key = ?",
    [importKey],
  );
  return row ? { ...row } : null;
}
