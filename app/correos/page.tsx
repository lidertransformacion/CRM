import { Drafts } from "@/components/emails/Drafts";
import { getDb } from "@/lib/db";
import type { EmailTemplate } from "@/lib/emails/templates";

export const dynamic = "force-dynamic";

export default async function CorreosPage() {
  const db = await getDb();
  const templates = await db.all<{
    id: string;
    name: string;
    subject: string;
    body: string;
    sort_order: number;
  }>("SELECT id, name, subject, body, sort_order FROM email_templates ORDER BY sort_order");
  const mapped: EmailTemplate[] = templates.map((template) => ({ ...template, sortOrder: template.sort_order }));
  return <Drafts templates={mapped} />;
}
