import type { Metadata } from "next";
import { Drafts } from "@/components/emails/Drafts";
import { findLeadByKey, listEmailTemplates } from "@/lib/emails/queries";
import { fromIdentity } from "@/lib/mail/message";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Correos" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Deep links: `?lead=<import_key>` preselecciona la oportunidad y `?plantilla=<id>` la plantilla.
 * La oportunidad se resuelve aquí, en el servidor, para que el borrador salga armado desde el primer render.
 */
export default async function CorreosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [templates, from] = await Promise.all([listEmailTemplates(), fromIdentity()]);
  const leadKey = first(params.lead);
  const lead = leadKey ? await findLeadByKey(leadKey) : null;
  const templateParam = first(params.plantilla);
  const templateId = templateParam && templates.some((template) => template.id === templateParam) ? templateParam : null;
  return (
    <Drafts
      templates={templates}
      initialTemplateId={templateId}
      initialLead={lead}
      missingLeadKey={leadKey && !lead ? leadKey : null}
      fromLabel={`${from.name} <${from.address}>`}
    />
  );
}
