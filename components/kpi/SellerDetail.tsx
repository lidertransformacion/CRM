"use client";

import { Info } from "lucide-react";
import type { SalesKpi, StageAge } from "@/lib/kpi/compute";
import { cn, cop } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { formatRate } from "@/components/kpi/targets";

const WARN_DAYS = 60;
const DANGER_DAYS = 120;

/** Detalle de un vendedor (o del equipo): indicadores pequeños y antigüedad por etapa. */
export function SellerDetail({ kpi, displayName, isTeam }: { kpi: SalesKpi; displayName: string; isTeam: boolean }) {
  return (
    <Card>
      <CardHeader
        title={displayName}
        description={isTeam ? "Totales de todos los vendedores. Elige a una persona arriba para ver su detalle." : "Abiertas, ganadas y perdidas salen de la etapa del pipeline; las recurrentes no entran en la tasa."}
      />
      <CardBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniStat label="Abiertas" value={kpi.open} />
          <MiniStat label="Ganadas" value={kpi.won} tone={kpi.won > 0 ? "ok" : undefined} />
          <MiniStat label="Perdidas" value={kpi.lost} />
          <MiniStat label="Tasa de cierre" value={formatRate(kpi.winRate)} />
          <MiniStat label="Recurrentes" value={kpi.recurrente} />
          <MiniStat label="Inactivas" value={kpi.inactive} />
          <MiniStat label="Act. vencidas" value={kpi.overdueActivities} tone={kpi.overdueActivities > 0 ? "danger" : undefined} />
          <MiniStat label="Ingreso esperado" value={cop(kpi.expectedRevenue)} small />
          <MiniStat label="Ponderado" value={cop(kpi.weightedRevenue)} small />
        </div>
        <StageAging stages={kpi.stageAging} />
      </CardBody>
    </Card>
  );
}

function MiniStat({ label, value, tone, small = false }: { label: string; value: number | string; tone?: "ok" | "danger"; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5">
      <p className="truncate text-[11px] font-medium text-ink-3">{label}</p>
      <p className={cn("num mt-0.5 truncate font-semibold leading-tight", small ? "text-sm" : "text-lg", tone === "ok" && "text-ok", tone === "danger" && "text-danger", !tone && "text-ink")}>{value}</p>
    </div>
  );
}

/**
 * Barras horizontales con escala relativa al máximo de ese vendedor.
 * En escritorio la etiqueta va a la izquierda de la barra; en móvil, arriba con el promedio a la derecha y la barra a ancho completo.
 */
function StageAging({ stages }: { stages: StageAge[] }) {
  const max = stages.reduce((acc, stage) => Math.max(acc, stage.avgDays), 0);
  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="font-sans text-sm font-semibold text-ink">Antigüedad por etapa</h3>
        <Tooltip content={`Días desde la creación de la oportunidad, no tiempo en la etapa (el export de Odoo no trae esa fecha). Ámbar si el promedio supera ${WARN_DAYS} días, rojo si supera ${DANGER_DAYS}. Las barras se comparan entre sí: la más larga es la etapa más lenta de esta persona.`}>
          <button type="button" className="rounded-full p-0.5 text-ink-3 hover:bg-accent-soft hover:text-ink" aria-label="Cómo se calcula la antigüedad">
            <Info className="size-3.5" />
          </button>
        </Tooltip>
      </div>
      <ul className="space-y-3 sm:space-y-2.5">
        {stages.map((stage) => {
          const tone = stage.avgDays > DANGER_DAYS ? "danger" : stage.avgDays > WARN_DAYS ? "warn" : null;
          const width = max > 0 && stage.count > 0 ? Math.max(2, Math.round((stage.avgDays / max) * 100)) : 0;
          const plural = stage.count === 1 ? "oportunidad" : "oportunidades";
          return (
            <li key={stage.stage} className="grid grid-cols-1 gap-y-1 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center sm:gap-x-3">
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <span className="block min-w-0 truncate text-xs font-medium text-ink-2" title={stage.stage}>{stage.short}</span>
                <span className={cn("num shrink-0 text-xs sm:hidden", tone === "danger" ? "text-danger" : tone === "warn" ? "text-hl-ink" : "text-ink-2")}>
                  {stage.count ? `${stage.avgDays} días promedio` : "—"}
                </span>
              </div>
              <div className="min-w-0">
                <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft">
                  <div
                    className={cn("h-full rounded-full transition-[width]", tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-navy-2")}
                    style={{ width: `${width}%` }}
                    role="img"
                    aria-label={stage.count ? `${stage.avgDays} días promedio` : "Sin oportunidades"}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
                  {stage.count === 0 ? (
                    <span>Sin oportunidades abiertas</span>
                  ) : (
                    <>
                      <span className="num max-sm:hidden">
                        {stage.count} {plural} · {stage.avgDays} días promedio · máx {stage.maxDays}
                      </span>
                      <span className="num sm:hidden">
                        {stage.count} {plural} · máx {stage.maxDays} días
                      </span>
                    </>
                  )}
                  {tone === "danger" && <Badge tone="danger" size="sm">Más de {DANGER_DAYS} días</Badge>}
                  {tone === "warn" && <Badge tone="warn" size="sm">Más de {WARN_DAYS} días</Badge>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
