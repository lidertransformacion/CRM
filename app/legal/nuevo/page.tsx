import type { Metadata } from "next";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { actorOwnsTarget, type Actor } from "@/lib/legal/access";
import { describeTarget } from "@/lib/legal/contracts";
import { getDb } from "@/lib/db";
import { ContractForm } from "@/components/legal/ContractForm";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subir contrato" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ lead?: string; equipo?: string }> }) {
  const session = await requirePageUser("/legal/nuevo");
  if (!can(session.role, "upload_contract")) {
    return (
      <div className="page">
        <PageHeader eyebrow="Legal" title="Subir contrato" description="Gerencia consulta los contratos. No los carga." />
        <Card><EmptyState title="No puedes subir contratos" description="Pide a Legal o a Comercial que cargue el PDF." /></Card>
      </div>
    );
  }
  const params = await searchParams;
  const db = await getDb();
  const actor: Actor = { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null };
  const preset = [];
  if (params.lead && (await actorOwnsTarget(db, actor, "lead", params.lead))) preset.push(await describeTarget(db, "lead", params.lead));
  if (params.equipo && (await actorOwnsTarget(db, actor, "equipment", params.equipo))) preset.push(await describeTarget(db, "equipment", params.equipo));
  return (
    <div className="page">
      <PageHeader eyebrow="Legal" title="Subir contrato" description="El PDF puede estar ya firmado. Elige el estado al guardarlo." />
      <ContractForm mode="create" canEdit presetLinks={preset} />
    </div>
  );
}
