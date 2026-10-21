import Link from "next/link";
import type { SessionPayload } from "@/lib/auth/session";
import { legalSummary } from "@/lib/legal/summary";
import { getDb } from "@/lib/db";
import { novedadLabel, statusLabel, statusTone } from "@/components/legal/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Inicio de Legal: vencimientos, firmas en turno y lo último que cambió. */
export async function LegalSummary({ session }: { session: SessionPayload }) {
  const data = await legalSummary(await getDb(), { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null });
  return (
    <div className="page space-y-4">
      <PageHeader eyebrow="Legal" title="Inicio" description="Contratos por vencer, firmas que te tocan y las últimas novedades." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Por vencer" description="Dentro del aviso de renovación." actions={<Link href="/legal?vencer=1" className="text-sm text-navy-2 underline">Ver contratos</Link>} />
          {data.expiring.length === 0 ? (
            <EmptyState compact title="Nada por vencer" description="Cuando un contrato se acerque a su vencimiento, aparecerá aquí." />
          ) : (
            <ul className="divide-y divide-line-2">
              {data.expiring.slice(0, 8).map((contract) => (
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
        <Card>
          <CardHeader title="Pendiente de mi firma" actions={<Link href="/firmas" className="text-sm text-navy-2 underline">Ver firmas</Link>} />
          {data.pending.length === 0 ? (
            <EmptyState compact title="Nada por firmar" description="Cuando te toque un contrato, aparecerá aquí y en tu correo." />
          ) : (
            <ul className="divide-y divide-line-2">
              {data.pending.map((item) => (
                <li key={item.requestId}>
                  <Link href={`/firmas/${item.requestId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-ink-3">{item.code ?? "Contrato"} · paso {item.stepOrder}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Actualizaciones recientes" description="Contratos tocados y novedades, de la más nueva a la más vieja." />
        {data.recentContracts.length === 0 && data.recentNotes.length === 0 ? (
          <EmptyState compact title="Sin movimiento" description="Los cambios de contratos y las novedades se listan aquí." />
        ) : (
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-line-2">
            <ul className="divide-y divide-line-2">
              {data.recentContracts.map((contract) => (
                <li key={contract.id}>
                  <Link href={`/legal/contratos/${contract.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                    <span>
                      <span className="block text-sm font-medium">{contract.title}</span>
                      <span className="text-xs text-ink-3">{contract.updated_at.slice(0, 10)}{contract.end_date ? ` · vence ${contract.end_date}` : ""}</span>
                    </span>
                    <Badge tone={statusTone(contract.status)} size="sm">{statusLabel(contract.status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-line-2">
              {data.recentNotes.length === 0 ? (
                <li className="px-5 py-3 text-sm text-ink-3">Todavía no hay novedades.</li>
              ) : (
                data.recentNotes.map((note) => (
                  <li key={note.id}>
                    <Link href={`/legal/contratos/${note.contract_id}`} className="block px-5 py-3 hover:bg-accent-soft">
                      <span className="text-xs text-ink-3">{novedadLabel(note.kind)} · {note.created_at.slice(0, 10)} · {note.title}</span>
                      <span className="mt-1 block truncate text-sm">{note.body}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
