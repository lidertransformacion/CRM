import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { expiringContracts, listContracts } from "@/lib/legal/contracts";
import { getDb } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { statusLabel } from "@/components/legal/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gerencia" };

export default async function GerenciaPage() {
  const session = await requirePageUser("/gerencia");
  if (!can(session.role, "view_gerencia")) {
    return (
      <div className="page">
        <PageHeader eyebrow="Dirección" title="Gerencia" description="Esta vista es para gerencia y administración." />
        <Card><EmptyState title="No está disponible para tu rol" description="Puedes consultar los contratos desde el menú Contratos." /></Card>
      </div>
    );
  }
  const actor = { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null };
  const db = await getDb();
  const [all, expiring] = await Promise.all([listContracts(db, actor, ""), expiringContracts(db, actor)]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Dirección"
        title="Gerencia"
        description="Vista de dirección. Los indicadores comerciales y el tablero de firmas llegan después. Por ahora: cuántos contratos hay y cuáles están por vencer."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Contratos" description="Lectura de todo el archivo legal." />
          <CardBody>
            <p className="font-serif text-3xl text-ink">{all.length}</p>
            <Link href="/legal" className="mt-2 inline-block text-sm text-navy-2 underline">Abrir contratos</Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Por vencer" description="Según la fecha de fin y los días de aviso." />
          <CardBody>
            <p className="font-serif text-3xl text-ink">{expiring.length}</p>
            <Link href="/legal?vencer=1" className="mt-2 inline-block text-sm text-navy-2 underline">Ver la lista</Link>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Próximos vencimientos" />
        {expiring.length === 0 ? (
          <EmptyState compact title="Nada por vencer" description="Cuando un contrato se acerque a su fecha de fin, aparecerá aquí." />
        ) : (
          <ul className="divide-y divide-line-2">
            {expiring.slice(0, 12).map((contract) => (
              <li key={contract.id}>
                <Link href={`/legal/contratos/${contract.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                  <span>
                    <span className="block text-sm font-medium">{contract.title}</span>
                    <span className="text-xs text-ink-3">{contract.end_date}</span>
                  </span>
                  <Badge tone="warn" size="sm">{statusLabel(contract.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
