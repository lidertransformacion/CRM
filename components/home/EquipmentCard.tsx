import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { LinkList, LinkRow, SeeAll } from "@/components/home/LinkList";
import { plural } from "@/lib/home/format";
import { SOON_DAYS, type EquipmentReason, type EquipmentSummary } from "@/lib/home/queries";
import { shortDate } from "@/lib/utils";

type Tone = "danger" | "warn" | "neutral";

const REASONS: Record<EquipmentReason, { tone: Tone; label: (date: string | null) => string; explain: string }> = {
  maintenance_overdue: {
    tone: "danger",
    label: (date) => `Mantenimiento venció ${shortDate(date)}`,
    explain: "Último mantenimiento (o fecha de entrega) más la frecuencia del equipo ya quedó atrás",
  },
  warranty_expiring: {
    tone: "warn",
    label: (date) => `Garantía vence ${shortDate(date)}`,
    explain: `La garantía termina dentro de los próximos ${SOON_DAYS} días`,
  },
  warranty_expired: {
    tone: "danger",
    label: (date) => (date ? `Garantía venció ${shortDate(date)}` : "Garantía vencida"),
    explain: "La garantía del proveedor ya terminó: cualquier reparación corre por cuenta de Libertario",
  },
  maintenance_soon: {
    tone: "warn",
    label: (date) => `Mantenimiento ${shortDate(date)}`,
    explain: `Le toca mantenimiento dentro de los próximos ${SOON_DAYS} días`,
  },
  no_base: {
    tone: "neutral",
    label: () => "Sin fecha base",
    explain: "Tiene frecuencia de mantenimiento pero no hay registros ni fecha de entrega para calcular el próximo",
  },
};

/** Equipos con garantía vencida o por vencer, o con mantenimiento vencido, próximo o sin fecha base. Cada fila abre la hoja de vida. */
export function EquipmentCard({ summary }: { summary: EquipmentSummary }) {
  const description = [
    plural(summary.warrantyExpired, "garantía vencida", "garantías vencidas"),
    summary.warrantyExpiring ? `${summary.warrantyExpiring} por vencer` : null,
    summary.maintenanceOverdue ? `${plural(summary.maintenanceOverdue, "mantenimiento vencido", "mantenimientos vencidos")}` : null,
    summary.noBase ? `${summary.noBase} sin fecha base` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card>
      <CardHeader title="Equipos a revisar" description={description} actions={<SeeAll href="/comodatos" count={summary.total} />} />
      {summary.rows.length === 0 ? (
        <EmptyState compact icon={<CircleCheck />} title="Equipos al día" description="Ninguna garantía vencida ni mantenimiento pendiente." />
      ) : (
        <LinkList>
          {summary.rows.map((row) => {
            const reason = REASONS[row.reason];
            return (
              <LinkRow
                key={row.serial}
                href={row.href}
                title={`${row.storeCode} · ${row.name}`}
                meta={[row.where, row.serial, row.note].filter(Boolean).join(" · ")}
                aside={
                  <Tooltip content={reason.explain}>
                    <Badge tone={reason.tone} size="sm">
                      {reason.label(row.reasonDate)}
                    </Badge>
                  </Tooltip>
                }
              />
            );
          })}
        </LinkList>
      )}
    </Card>
  );
}
