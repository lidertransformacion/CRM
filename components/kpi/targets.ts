import { KPI_METRICS, type SalesKpi } from "@/lib/kpi/compute";
import { cop } from "@/lib/utils";

/** Valor de `selected` que representa al equipo completo (en la base es el vendedor vacío). */
export const TEAM = "";

export type KpiTarget = { id: number; salesperson: string; metric: string; period: string; target_value: number };
export type MetricDef = (typeof KPI_METRICS)[number];
export type MetricId = MetricDef["id"];

export type TargetStatus = "met" | "on_track" | "far" | "none" | "no_data";

export const STATUS_LABEL: Record<TargetStatus, { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = {
  met: { label: "Cumplida", tone: "ok" },
  on_track: { label: "En camino", tone: "info" },
  far: { label: "Lejos", tone: "warn" },
  none: { label: "Sin meta", tone: "neutral" },
  no_data: { label: "Sin datos", tone: "neutral" },
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function metricById(id: string): MetricDef | undefined {
  return KPI_METRICS.find((metric) => metric.id === id);
}

/** "2026-10" → "octubre de 2026". */
export function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return period;
  return `${MONTHS[month - 1]} de ${year}`;
}

/** Mes (AAAA-MM) de una fecha ISO. */
export function periodOf(iso: string): string {
  return iso.slice(0, 7);
}

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(value);
}

/** Tasa 0–1 → "48 %". */
export function formatRate(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)} %`;
}

/** Formatea un valor según la unidad de la métrica (COP, %, cantidad o días). */
export function formatMetricValue(metric: MetricDef, value: number | null): string {
  if (value == null) return "—";
  if (metric.unit === "COP") return cop(value);
  if (metric.unit === "%") return `${formatNumber(value)} %`;
  return formatNumber(value, 0);
}

/** Texto corto de la unidad para etiquetas y ayudas. */
export function unitLabel(metric: MetricDef): string {
  switch (metric.unit) {
    case "COP":
      return "pesos";
    case "%":
      return "porcentaje";
    default:
      return metric.unit;
  }
}

/** Ayuda del campo "Meta" en el diálogo, según la métrica. */
export function valueHint(metric: MetricDef): string {
  switch (metric.id) {
    case "expected_revenue":
      return "En pesos colombianos, sin puntos ni decimales. Ej.: 50000000";
    case "win_rate":
      return "Porcentaje de 0 a 100. Ej.: 45 para una tasa de cierre del 45 %";
    case "overdue_activities":
      return "Cantidad de actividades vencidas. Menos es mejor. Ej.: 0";
    case "max_avg_stage_age_days":
      return "Días promedio desde la creación, en la etapa más lenta. Menos es mejor. Ej.: 60";
    default:
      return "Cantidad de oportunidades. Ej.: 12";
  }
}

/**
 * Avance hacia la meta como proporción (1 = cumplida). Puede pasar de 1 cuando se supera.
 * Para "menos es mejor": 1 si el real ya está en o por debajo de la meta; si no, meta / real.
 */
export function targetProgress(metric: MetricDef, actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  if (metric.lowerIsBetter) {
    if (actual <= target) return 1;
    return target / actual;
  }
  if (target <= 0) return 1;
  return actual / target;
}

export function targetStatus(hasTarget: boolean, progress: number | null): TargetStatus {
  if (!hasTarget) return "none";
  if (progress == null) return "no_data";
  if (progress >= 1) return "met";
  if (progress >= 0.7) return "on_track";
  return "far";
}

/** Busca la meta de ese vendedor (vacío = equipo), métrica y mes. */
export function findTargetFor(targets: KpiTarget[], salesperson: string, metric: string, period: string): KpiTarget | undefined {
  return targets.find((item) => item.salesperson === salesperson && item.metric === metric && item.period === period);
}

/** KPI del vendedor seleccionado; vacío = equipo. */
export function kpiFor(selected: string, team: SalesKpi, people: SalesKpi[]): SalesKpi {
  if (selected === TEAM) return team;
  return people.find((person) => person.salesperson === selected) ?? team;
}
