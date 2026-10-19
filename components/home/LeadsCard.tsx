import { CircleCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkList, LinkRow, SeeAll } from "@/components/home/LinkList";
import { plural } from "@/lib/home/format";
import type { LeadAlert } from "@/lib/home/queries";
import { cop, shortDate } from "@/lib/utils";

/** Oportunidades abiertas con la próxima actividad vencida. Cada fila abre esa oportunidad en el pipeline. */
export function LeadsCard({ rows, total }: { rows: LeadAlert[]; total: number }) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Oportunidades con actividad vencida"
        description="Abiertas en el pipeline y con la próxima actividad ya pasada; las de mayor ingreso primero"
        actions={<SeeAll href="/pipeline" count={total} />}
      />
      {rows.length === 0 ? (
        <EmptyState compact icon={<CircleCheck />} title="Sin actividades vencidas" description="Ninguna oportunidad abierta tiene una actividad atrasada." />
      ) : (
        <LinkList>
          {rows.map((row) => (
            <LinkRow
              key={row.importKey}
              href={row.href}
              title={row.customer || row.name}
              meta={[row.customer && row.name !== row.customer ? row.name : null, row.seller, row.stage].filter(Boolean).join(" · ")}
              aside={
                // Escritorio: fecha sobre el monto, alineados a la derecha. Móvil: en una sola línea.
                <div className="flex flex-wrap items-baseline gap-x-2 sm:block sm:text-right">
                  <p className="num text-xs font-medium text-danger" title={`Hace ${plural(row.daysLate, "día")}`}>
                    Venció {shortDate(row.deadline)}
                  </p>
                  <p className="num text-xs text-ink-3">{cop(row.expectedRevenue)}</p>
                </div>
              }
            />
          ))}
        </LinkList>
      )}
    </Card>
  );
}
