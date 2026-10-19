"use client";

import { useState } from "react";
import { KPI_METRICS, metricActual, type SalesKpi } from "@/lib/kpi/compute";
import { displaySeller } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TEAM, formatMetricValue, kpiFor, metricById, monthLabel, valueHint, type KpiTarget, type MetricId } from "@/components/kpi/targets";

export type TargetDraft = { salesperson: string; metric: MetricId; period: string; targetValue: string };

/** Diálogo para crear o reemplazar una meta. Guarda vía POST /api/kpis y devuelve la fila con su id real. */
export function TargetDialog({
  initial,
  team,
  people,
  onClose,
  onSaved,
}: {
  initial: TargetDraft;
  team: SalesKpi;
  people: SalesKpi[];
  onClose: () => void;
  onSaved: (target: KpiTarget) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const metric = metricById(draft.metric) ?? KPI_METRICS[0];
  const kpi = kpiFor(draft.salesperson, team, people);
  const actual = metricActual(kpi, metric.id);
  const targetName = draft.salesperson === TEAM ? "el equipo" : displaySeller(draft.salesperson);

  function validate(): string | null {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.period)) return "Elige un mes.";
    if (draft.targetValue.trim() === "") return "Escribe el valor de la meta.";
    const value = Number(draft.targetValue);
    if (!Number.isFinite(value) || value < 0) return "La meta debe ser un número mayor o igual a 0.";
    if (metric.id === "win_rate" && value > 100) return "La tasa de cierre es un porcentaje: entre 0 y 100.";
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/kpis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesperson: draft.salesperson, metric: draft.metric, period: draft.period, targetValue: Number(draft.targetValue) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { target?: KpiTarget; error?: string };
      if (!response.ok || !payload.target) throw new Error(payload.error || "Inténtalo de nuevo.");
      onSaved(payload.target);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se pudo guardar la meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent size="sm" title="Definir meta" description="Se compara con el número real del corte. Si ya hay una meta para el mismo vendedor, métrica y mes, se reemplaza.">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogBody className="space-y-3">
            <FieldGrid cols={2}>
              <Field label="Vendedor" htmlFor="target-salesperson">
                <Select id="target-salesperson" value={draft.salesperson} onChange={(event) => setDraft({ ...draft, salesperson: event.target.value })}>
                  <option value={TEAM}>Equipo</option>
                  {people.map((person) => (
                    <option key={person.salesperson} value={person.salesperson}>{displaySeller(person.salesperson)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Mes" htmlFor="target-period" required>
                <Input id="target-period" type="month" required value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value })} />
              </Field>
            </FieldGrid>
            <Field label="Métrica" htmlFor="target-metric">
              <Select id="target-metric" value={draft.metric} onChange={(event) => setDraft({ ...draft, metric: event.target.value as MetricId })}>
                {KPI_METRICS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}{item.lowerIsBetter ? " (menos es mejor)" : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Meta" htmlFor="target-value" required hint={valueHint(metric)} error={error}>
              <Input
                id="target-value"
                type="number"
                inputMode="decimal"
                min={0}
                max={metric.id === "win_rate" ? 100 : undefined}
                step={metric.unit === "%" ? 0.1 : 1}
                value={draft.targetValue}
                onChange={(event) => setDraft({ ...draft, targetValue: event.target.value })}
                aria-invalid={!!error}
                autoFocus
              />
            </Field>
            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
              Real hoy para {targetName}: <strong className="num text-ink">{formatMetricValue(metric, actual)}</strong>
              <span className="text-ink-3"> · meta para {monthLabel(draft.period) || "ese mes"}</span>
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" loading={saving}>Guardar meta</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
