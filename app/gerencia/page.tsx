import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { expiringContracts } from "@/lib/legal/contracts";
import { gerenciaSnapshot } from "@/lib/gerencia/metrics";
import { getDb } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { statusLabel } from "@/components/legal/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gerencia" };

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

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
  const [snapshot, expiring] = await Promise.all([gerenciaSnapshot(db, actor), expiringContracts(db, actor)]);
  const metrics = [
    { label: "Negocios abiertos", value: String(snapshot.openDeals) },
    { label: "Valor del pipeline", value: money.format(snapshot.pipelineValue) },
    { label: "Ganados / perdidos", value: `${snapshot.won} / ${snapshot.lost}` },
    { label: "Visitas", value: String(snapshot.visits) },
    { label: "Firmados este mes", value: String(snapshot.signedThisMonth) },
    { label: "Por vencer", value: String(snapshot.expiring) },
  ];
  return (
    <div className="page space-y-4">
      <PageHeader eyebrow="Dirección" title="Gerencia" description="Negocios, visitas, contratos y lo que espera tu firma." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((item) => (
          <Card key={item.label}>
            <CardBody>
              <p className="text-xs text-ink-3">{item.label}</p>
              <p className="font-serif text-2xl text-ink">{item.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contratos por estado" />
          {snapshot.contractsByStatus.length === 0 ? (
            <EmptyState compact title="Sin contratos" />
          ) : (
            <ul className="divide-y divide-line-2">
              {snapshot.contractsByStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{statusLabel(row.status)}</span>
                  <span className="font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Pendiente de mi firma" description="Aprobaciones que están en tu turno." />
          {snapshot.pending.length === 0 ? (
            <EmptyState compact title="Nada pendiente" description="No tienes un contrato esperando tu firma." />
          ) : (
            <ul className="divide-y divide-line-2">
              {snapshot.pending.map((item) => (
                <li key={item.requestId}>
                  <Link href={`/firmas/${item.requestId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                    <span className="text-sm font-medium">{item.title}</span>
                    <Badge tone="warn" size="sm">Firmar</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card>
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
