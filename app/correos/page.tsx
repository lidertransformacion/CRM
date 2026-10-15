import { Drafts } from "@/components/emails/Drafts";
import { getDb } from "@/lib/db";
import type { EmailTemplate } from "@/lib/emails/templates";

export const dynamic = "force-dynamic";

export default function CorreosPage() {
  const templates = getDb().prepare("SELECT id, name, subject, body, sort_order FROM email_templates ORDER BY sort_order").all() as {
    id: string;
    name: string;
    subject: string;
    body: string;
    sort_order: number;
  }[];
  const mapped: EmailTemplate[] = templates.map((template) => ({ ...template, sortOrder: template.sort_order }));
  return <Drafts templates={mapped} />;
}
