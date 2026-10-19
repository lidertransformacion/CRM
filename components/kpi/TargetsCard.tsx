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

  return (
    <Card ref={cardRef}>
      <CardHeader
        title={`Metas de ${displayName} · ${monthLabel(month)}`}
        description="Cada meta se compara con el número real del corte de hoy. «En camino» es llegar al 70 % o más."
        actions={
          <Field label="Mes" inline htmlFor="kpi-targets-month">
            <Input id="kpi-targets-month" type="month" value={month} onChange={(event) => event.target.value && onMonthChange(event.target.value)} className="w-[170px]" aria-label="Mes de las metas" />
          </Field>
        }
      />
      <div className="overflow-auto">
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
                  <TD>
                    {progress == null ? (
                      <span className="text-xs text-ink-3">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-accent-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(progress * 100))}>
                          <div className={cn("h-full rounded-full", status === "met" ? "bg-ok" : status === "on_track" ? "bg-info" : "bg-warn")} style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
                        </div>
                        <span className="num text-xs text-ink-2">{Math.round(progress * 100)} %</span>
                      </div>
                    )}
                  </TD>
                  <TD><Badge tone={meta.tone} dot>{meta.label}</Badge></TD>
                  <TD align="right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Acciones de la meta ${metric.label}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {target ? (
                          <>
                            <DropdownMenuItem onSelect={() => window.setTimeout(() => onDefine(metric.id, target), 0)}><Pencil /> Editar meta</DropdownMenuItem>
                            <DropdownMenuItem danger onSelect={() => window.setTimeout(() => setPendingDelete({ target, metric }), 0)}><Trash /> Eliminar meta</DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem onSelect={() => window.setTimeout(() => onDefine(metric.id), 0)}><Plus /> Definir meta</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
      <CardFooter className="justify-start text-xs text-ink-3">
        {defined === 0
          ? `Sin metas para ${displayName} en ${monthLabel(month)}. Usa «Definir meta» arriba a la derecha o el menú de cada fila.`
          : `${defined} de ${KPI_METRICS.length} métricas con meta. Las metas del equipo y las de cada vendedor son independientes.`}
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
