import { getDb } from "@/lib/db";
import type { EmailTemplate } from "@/lib/emails/templates";

/** Resumen de una oportunidad con lo que necesita un borrador de correo. */
export type LeadSummary = {
  import_key: string;
  name: string;
  customer: string;
  salesperson: string;
  stage: string;
  expected_revenue: number | null;
};

/** Plantillas de correo guardadas en la base, en el orden en que se muestran. */
export function listEmailTemplates(db = getDb()): EmailTemplate[] {
  const rows = db.prepare("SELECT id, name, subject, body, sort_order FROM email_templates ORDER BY sort_order").all() as {
    id: string;
    name: string;
    subject: string;
    body: string;
    sort_order: number;
  }[];
  return rows.map((row) => ({ id: row.id, name: row.name, subject: row.subject, body: row.body, sortOrder: row.sort_order }));
}

/** Busca una oportunidad por su import_key (el deep link `/correos?lead=` lo usa). */
export function findLeadByKey(importKey: string, db = getDb()): LeadSummary | null {
  const row = db
    .prepare("SELECT import_key, name, customer, salesperson, stage, expected_revenue FROM leads WHERE import_key = ?")
    .get(importKey) as LeadSummary | undefined;
  return row ? { ...row } : null;
}
