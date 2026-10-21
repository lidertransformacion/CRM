import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { HttpError } from "@/lib/auth/users";
import { contractBundle } from "@/lib/legal/contracts";
import { latestSignature } from "@/lib/legal/signatures";
import { getDb } from "@/lib/db";
import { ContractForm, type ContractInitial } from "@/components/legal/ContractForm";
import { SignatureActions } from "@/components/legal/SignatureActions";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contrato" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageUser("/legal");
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) notFound();
  try {
    const bundle = await contractBundle(await getDb(), { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null }, numeric);
    const initial: ContractInitial = {
      id: bundle.contract.id,
      code: bundle.contract.code,
      title: bundle.contract.title,
      type: bundle.contract.type,
      status: bundle.contract.status,
      counterparty_name: bundle.contract.counterparty_name,
      counterparty_nit: bundle.contract.counterparty_nit,
      country: bundle.contract.country,
      start_date: bundle.contract.start_date,
      end_date: bundle.contract.end_date,
      renewal_notice_days: bundle.contract.renewal_notice_days,
      value_cop: bundle.contract.value_cop,
      file: bundle.file ? { id: bundle.file.id, name: bundle.file.name, size_bytes: bundle.file.size_bytes } : null,
      links: bundle.links.map((link) => ({ target_type: link.target_type, target_key: link.target_key, label: link.label })),
      signers: bundle.signers.map((signer) => ({
        role: signer.role,
        signer_email: signer.signer_email,
        signer_name: signer.signer_name ?? "",
        signer_user_id: signer.signer_user_id,
      })),
      novedades: bundle.novedades.map((note) => ({
        id: note.id,
        kind: note.kind,
        body: note.body,
        due_date: note.due_date,
        created_at: note.created_at,
        author_email: note.author_email ?? null,
      })),
    };
    const latest = await latestSignature(await getDb(), numeric);
    const canSend = can(session.role, "upload_contract");
    return (
      <div className="page space-y-4">
        <PageHeader eyebrow={bundle.contract.code ?? "Contrato"} title={bundle.contract.title} description="Consulta, vínculos, novedades y orden de firma." />
        <SignatureActions contractId={numeric} requestId={latest?.id ?? null} status={latest?.status ?? null} canSend={canSend} />
        <ContractForm mode="edit" canEdit={bundle.canEdit} initial={initial} />
      </div>
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
