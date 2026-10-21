import Link from "next/link";
import type { SessionPayload } from "@/lib/auth/session";
import { expiringContracts } from "@/lib/legal/contracts";
import { gerenciaSnapshot } from "@/lib/gerencia/metrics";
import { getDb } from "@/lib/db";
import { statusLabel } from "@/components/legal/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Números, proyección del pipeline y lo que espera la firma de quien entra. */
export async function GerenciaDashboard({ session }: { session: SessionPayload }) {
  const actor = { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null };
  const db = await getDb();
  const [snapshot, expiring] = await Promise.all([gerenciaSnapshot(db, actor), expiringContracts(db, actor)]);
  const metrics = [
    { label: "Negocios abiertos", value: String(snapshot.openDeals) },
    { label: "Valor del pipeline", value: money.format(snapshot.pipelineValue) },
    { label: "Proyección ponderada", value: money.format(snapshot.projection.weighted) },
    { label: "Ganados / perdidos", value: `${snapshot.won} / ${snapshot.lost}` },
    { label: "Visitas", value: String(snapshot.visits) },
    { label: "Firmados este mes", value: String(snapshot.signedThisMonth) },
    { label: "Por vencer", value: String(snapshot.expiring) },
    { label: "Cierres en 30 días", value: String(snapshot.projection.closingSoon) },
  ];
  return (
    <div className="page space-y-4">
      <PageHeader
        eyebrow="Dirección"
        title="Gerencia"
        description="Negocios, proyección del pipeline, visitas y contratos. La proyección ponderada usa el valor esperado por la probabilidad de cada negocio abierto."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((item) => (
          <Card key={item.label}>
            <CardBody>
              <p className="text-xs text-ink-3">{item.label}</p>
              <p className="font-serif text-2xl text-ink">{item.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Proyección por etapa"
          description={
            snapshot.projection.missingProbability
              ? `${snapshot.projection.missingProbability} negocios abiertos no tienen probabilidad y no entran en la proyección ponderada. Los cierres de 30 días suman ${money.format(snapshot.projection.closingSoonValue)}.`
              : `Los cierres previstos en 30 días suman ${money.format(snapshot.projection.closingSoonValue)}.`
          }
        />
        {snapshot.projection.byStage.length === 0 ? (
          <EmptyState compact title="Sin negocios abiertos" description="Cuando haya oportunidades en curso, verás su valor por etapa." />
        ) : (
          <ul className="divide-y divide-line-2">
            {snapshot.projection.byStage.map((row) => (
              <li key={row.stage} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>{row.stage}</span>
                <span className="text-ink-3">{row.count} · {money.format(row.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
          <EmptyState compact title="Nada por vencer" description="Cuando un contrato se acerque a su vencimiento, aparecerá aquí." />
        ) : (
          <ul className="divide-y divide-line-2">
            {expiring.slice(0, 12).map((contract) => (
              <li key={contract.id}>
                <Link href={`/legal/contratos/${contract.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                  <span>
                    <span className="block text-sm font-medium">{contract.title}</span>
                    <span className="text-xs text-ink-3">Vence {contract.end_date}</span>
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
