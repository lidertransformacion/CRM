"use client";

import { useState, type Ref } from "react";
import { Ellipsis, Pencil, Plus, Trash } from "lucide-react";
import { KPI_METRICS, metricActual, type SalesKpi } from "@/lib/kpi/compute";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  STATUS_LABEL,
  findTargetFor,
  formatMetricValue,
  monthLabel,
  targetProgress,
  targetStatus,
  type KpiTarget,
  type MetricDef,
  type MetricId,
  type TargetStatus,
} from "@/components/kpi/targets";

type PendingDelete = { target: KpiTarget; metric: MetricDef };

/** Metas del vendedor seleccionado para un mes: real, meta, progreso y estado por métrica. */
export function TargetsCard({
  kpi,
  selected,
  displayName,
  month,
  onMonthChange,
  targets,
  onDefine,
  onDeleted,
  cardRef,
}: {
  kpi: SalesKpi;
  selected: string;
  displayName: string;
  month: string;
  onMonthChange: (month: string) => void;
  targets: KpiTarget[];
  onDefine: (metric: MetricId, existing?: KpiTarget) => void;
  onDeleted: (id: number) => void;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = KPI_METRICS.map((metric) => {
    const target = findTargetFor(targets, selected, metric.id, month);
    const actual = metricActual(kpi, metric.id);
    const progress = targetProgress(metric, actual, target?.target_value ?? null);
    const status = targetStatus(!!target, progress);
    return { metric, target, actual, progress, status };
  });
  const defined = rows.filter((row) => row.target).length;

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/kpis?id=${pendingDelete.target.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Inténtalo de nuevo.");
      onDeleted(pendingDelete.target.id);
      toast({ title: "Meta eliminada", description: `${pendingDelete.metric.label} · ${displayName} · ${monthLabel(month)}` });
      setPendingDelete(null);
    } catch (error) {
      toast({ title: "No se pudo eliminar la meta", description: error instanceof Error ? error.message : "Inténtalo de nuevo.", tone: "danger" });
    } finally {
      setDeleting(false);
    }
  }

  function handleMonth(value: string) {
    if (value) onMonthChange(value);
  }

  return (
    <Card ref={cardRef}>
      <CardHeader
        title={`Metas de ${displayName} · ${monthLabel(month)}`}
        description="Cada meta se compara con el número real del corte de hoy. «En camino» es llegar al 70 % o más."
        actions={
          <Field label="Mes" inline htmlFor="kpi-targets-month" className="max-sm:hidden">
            <Input id="kpi-targets-month" type="month" value={month} onChange={(event) => handleMonth(event.target.value)} className="w-[170px]" aria-label="Mes de las metas" />
          </Field>
        }
      />

      {/* Móvil: selector de mes a ancho completo y una fila por métrica. */}
      <div className="sm:hidden">
        <div className="border-b border-line-2 px-4 py-3">
          <Field label="Mes de las metas" htmlFor="kpi-targets-month-mobile">
            <Input id="kpi-targets-month-mobile" type="month" value={month} onChange={(event) => handleMonth(event.target.value)} />
          </Field>
        </div>
        <ul className="divide-y divide-line-2">
          {rows.map(({ metric, target, actual, progress, status }) => {
            const meta = STATUS_LABEL[status];
            return (
              <li key={metric.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm font-medium text-ink">
                      {metric.label}
                      {metric.lowerIsBetter && <span className="ml-1.5 text-[11px] font-normal text-ink-3">menos es mejor</span>}
                    </p>
                    <p className="num mt-0.5 text-sm">
                      <span className="font-semibold text-ink">{formatMetricValue(metric, actual)}</span>
                      <span className="text-ink-3"> / {target ? formatMetricValue(metric, target.target_value) : "sin meta"}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    <TargetMenu metric={metric} target={target} onDefine={onDefine} onDelete={(item) => setPendingDelete({ target: item, metric })} size="icon" />
                  </div>
                </div>
                {progress != null && <Progress progress={progress} status={status} className="mt-2" fluid />}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Escritorio: tabla. */}
      <div className="overflow-auto max-sm:hidden">
        <Table className="min-w-[720px]">
          <THead>
            <tr>
              <TH>Métrica</TH>
              <TH align="right">Real</TH>
              <TH align="right">Meta</TH>
              <TH>Progreso</TH>
              <TH>Estado</TH>
              <TH align="right"><span className="sr-only">Acciones</span></TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ metric, target, actual, progress, status }) => {
              const meta = STATUS_LABEL[status];
              return (
                <TR key={metric.id}>
                  <TD>
                    <span className="font-medium text-ink">{metric.label}</span>
                    {metric.lowerIsBetter && <span className="ml-1.5 text-[11px] text-ink-3">menos es mejor</span>}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">{formatMetricValue(metric, actual)}</TD>
                  <TD align="right" className={cn("whitespace-nowrap", !target && "text-ink-3")}>{target ? formatMetricValue(metric, target.target_value) : "—"}</TD>
                  <TD>{progress == null ? <span className="text-xs text-ink-3">—</span> : <Progress progress={progress} status={status} />}</TD>
                  <TD><Badge tone={meta.tone} dot>{meta.label}</Badge></TD>
                  <TD align="right">
                    <TargetMenu metric={metric} target={target} onDefine={onDefine} onDelete={(item) => setPendingDelete({ target: item, metric })} size="icon-sm" />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      <CardFooter className="justify-start text-xs text-ink-3">
        {defined === 0 ? (
          <>
            <span className="max-sm:hidden">Sin metas para {displayName} en {monthLabel(month)}. Usa «Definir meta» arriba a la derecha o el menú de cada fila.</span>
            <span className="sm:hidden">Sin metas para {displayName} en {monthLabel(month)}. Usa «Definir meta» arriba o el menú de cada métrica.</span>
          </>
        ) : (
          `${defined} de ${KPI_METRICS.length} métricas con meta. Las metas del equipo y las de cada vendedor son independientes.`
        )}
      </CardFooter>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <DialogContent
          size="sm"
          title="Eliminar meta"
          description={pendingDelete ? `${pendingDelete.metric.label} · ${displayName} · ${monthLabel(month)} · meta ${formatMetricValue(pendingDelete.metric, pendingDelete.target.target_value)}` : undefined}
        >
          <DialogBody>
            <p className="text-sm text-ink-2">La meta deja de compararse con el número real. Esta acción no se puede deshacer, pero puedes definirla de nuevo cuando quieras.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={deleting}>Eliminar meta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Barra de progreso hacia la meta: ancho fijo en la tabla, a ancho completo (`fluid`) en la lista de móvil. */
function Progress({ progress, status, fluid = false, className }: { progress: number; status: TargetStatus; fluid?: boolean; className?: string }) {
  const percent = Math.round(progress * 100);
  const capped = Math.min(100, percent);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("h-2 shrink-0 overflow-hidden rounded-full bg-accent-soft", fluid ? "min-w-0 flex-1" : "w-28")} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={capped}>
        <div className={cn("h-full rounded-full", status === "met" ? "bg-ok" : status === "on_track" ? "bg-info" : "bg-warn")} style={{ width: `${capped}%` }} />
      </div>
      <span className={cn("num text-xs text-ink-2", fluid && "w-11 shrink-0 text-right")}>{percent} %</span>
    </div>
  );
}

/** Menú ⋯ de una métrica: definir, editar o eliminar su meta. En móvil el botón mide 44 px. */
function TargetMenu({
  metric,
  target,
  onDefine,
  onDelete,
  size,
}: {
  metric: MetricDef;
  target: KpiTarget | undefined;
  onDefine: (metric: MetricId, existing?: KpiTarget) => void;
  onDelete: (target: KpiTarget) => void;
  size: "icon" | "icon-sm";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label={`Acciones de la meta ${metric.label}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {target ? (
          <>
            <DropdownMenuItem onSelect={() => window.setTimeout(() => onDefine(metric.id, target), 0)}><Pencil /> Editar meta</DropdownMenuItem>
            <DropdownMenuItem danger onSelect={() => window.setTimeout(() => onDelete(target), 0)}><Trash /> Eliminar meta</DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={() => window.setTimeout(() => onDefine(metric.id), 0)}><Plus /> Definir meta</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
