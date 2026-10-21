import type { Metadata } from "next";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { GerenciaDashboard } from "@/components/gerencia/Dashboard";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gerencia" };

export default async function GerenciaPage() {
  const session = await requirePageUser("/gerencia");
  if (!can(session.role, "view_gerencia")) {
    return (
      <div className="page">
        <PageHeader eyebrow="Dirección" title="Gerencia" description="Esta vista es para gerencia, comercial y administración." />
        <Card><EmptyState title="No está disponible para tu rol" description="Puedes consultar los contratos desde el menú Contratos." /></Card>
      </div>
    );
  }
  return <GerenciaDashboard session={session} />;
}
