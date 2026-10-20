import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Drafts } from "@/components/emails/Drafts";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { findLeadByKey, listEmailTemplates } from "@/lib/emails/queries";
import { gmailConnection } from "@/lib/google/tokens";
import { fromIdentity, mailTestMode } from "@/lib/mail/message";
import { getSql } from "@/lib/sql";

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
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  const db = await getSql();
  const [templates, shared, connection, testMode] = await Promise.all([
    listEmailTemplates(),
    fromIdentity(),
    session ? gmailConnection(db, session.uid) : Promise.resolve(null),
    mailTestMode(),
  ]);
  const from =
    connection?.status === "connected" ? { name: shared.name, address: connection.google_email } : shared;
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
      testMode={testMode}
    />
  );
}
