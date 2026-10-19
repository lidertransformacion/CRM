import { daysBetween } from "@/lib/utils";
import { OPEN_STAGES, STAGES } from "@/lib/odoo/stages";

export type LeadFact = {
  importKey: string;
  name: string;
  stage: string;
  salesperson: string;
  customer: string;
  expectedRevenue: number | null;
  probability: number | null;
  createdAt: string | null;
  active: boolean;
  wonStatus?: string;
  /** Last stage confirmed by Odoo. KPI classification uses this when the card has a local edit. */
  odooStage?: string | null;
  odooExpectedRevenue?: number | null;
  odooProbability?: number | null;
  syncState?: string;
};

export type ActivityFact = {
  assignee: string;
  deadline: string | null;
  state: string;
};

export type StageAge = {
  stage: string;
  short: string;
  count: number;
  avgDays: number;
  maxDays: number;
};

export type SalesKpi = {
  salesperson: string;
  open: number;
  won: number;
  lost: number;
  recurrente: number;
  inactive: number;
  winRate: number | null;
  expectedRevenue: number;
  weightedRevenue: number;
  missingRevenue: number;
  overdueActivities: number;
  stageAging: StageAge[];
};

export type KpiBundle = {
  asOf: string;
  team: SalesKpi;
  people: SalesKpi[];
};

export function normalizeWonStatus(value: string | null | undefined): string {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "won" || text === "ganado") return "ganado";
  if (text === "lost" || text === "perdido") return "perdido";
  if (text === "pending" || text === "pendiente" || text === "") return "pendiente";
  return text;
}

/** Open / won / lost follow Odoo `active` and won/lost status. Stage is only the fallback. */
export function classifyLead(lead: { stage: string; active: boolean; wonStatus?: string | null }): "open" | "won" | "lost" | "recurrente" {
  const status = normalizeWonStatus(lead.wonStatus);
  if (status === "ganado") return "won";
  if (status === "perdido" || !lead.active) return "lost";
  if (lead.stage === "OPORTUNIDAD PERDIDA") return "lost";
  if (lead.stage === "CLIENTE RECURRENTE") return "recurrente";
  if (lead.stage === "CIERRE/ GANADO") return "won";
  return "open";
}

export function kpiStage(lead: LeadFact): string {
  if (lead.syncState === "pending_local" && lead.odooStage) return lead.odooStage;
  return lead.odooStage || lead.stage;
}

export function kpiRevenue(lead: LeadFact): number | null {
  if (lead.syncState === "pending_local") return lead.odooExpectedRevenue ?? lead.expectedRevenue;
  return lead.expectedRevenue;
}

export function kpiProbability(lead: LeadFact): number | null {
  if (lead.syncState === "pending_local") return lead.odooProbability ?? lead.probability;
  return lead.probability;
}

export function revenueIsMissing(value: number | null | undefined): boolean {
  return value == null || value === 0;
}

export function isActivityOverdue(activity: ActivityFact, asOf: string): boolean {
  if (activity.state.toLowerCase() === "vencidas") return true;
  return !!activity.deadline && activity.deadline < asOf;
}

function summarize(name: string, leads: LeadFact[], activities: ActivityFact[], asOf: string): SalesKpi {
  const counts = { open: 0, won: 0, lost: 0, recurrente: 0, inactive: 0 };
  let expectedRevenue = 0;
  let weightedRevenue = 0;
  let missingRevenue = 0;
  const aging = new Map<string, number[]>();
  for (const lead of leads) {
    if (lead.syncState === "pending_create") continue;
    const stage = kpiStage(lead);
    const kind = classifyLead({ stage, active: lead.active, wonStatus: lead.wonStatus });
    counts[kind] += 1;
    if (!lead.active) counts.inactive += 1;
    if (kind === "open") {
      const revenue = kpiRevenue(lead);
      if (revenueIsMissing(revenue)) missingRevenue += 1;
      const amount = revenue ?? 0;
      expectedRevenue += amount;
      weightedRevenue += amount * ((kpiProbability(lead) ?? 0) / 100);
      if (lead.createdAt && OPEN_STAGES.has(stage)) {
        const list = aging.get(stage) ?? [];
        list.push(Math.max(0, daysBetween(lead.createdAt.slice(0, 10), asOf)));
        aging.set(stage, list);
      }
    }
  }
  const decided = counts.won + counts.lost;
  const stageAging = STAGES.filter((stage) => OPEN_STAGES.has(stage.name)).map((stage) => {
    const days = aging.get(stage.name) ?? [];
    const avg = days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : 0;
    return { stage: stage.name, short: stage.short, count: days.length, avgDays: Math.round(avg), maxDays: days.length ? Math.max(...days) : 0 };
  });
  return {
    salesperson: name,
    ...counts,
    winRate: decided ? counts.won / decided : null,
    expectedRevenue,
    weightedRevenue,
    missingRevenue,
    overdueActivities: activities.filter((activity) => isActivityOverdue(activity, asOf)).length,
    stageAging,
  };
}

export function computeKpis(leads: LeadFact[], activities: ActivityFact[], asOf: string): KpiBundle {
  const people = [...new Set(leads.map((lead) => lead.salesperson).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  return {
    asOf,
    team: summarize("Equipo", leads, activities, asOf),
    people: people
      .map((name) =>
        summarize(
          name,
          leads.filter((lead) => lead.salesperson === name),
          activities.filter((activity) => activity.assignee === name),
          asOf,
        ),
      )
      .sort((a, b) => b.expectedRevenue - a.expectedRevenue || b.open - a.open),
  };
}

export const KPI_METRICS = [
  { id: "open_count", label: "Abiertas", unit: "oportunidades", lowerIsBetter: false },
  { id: "won_count", label: "Ganadas", unit: "oportunidades", lowerIsBetter: false },
  { id: "win_rate", label: "Tasa de cierre", unit: "%", lowerIsBetter: false },
  { id: "expected_revenue", label: "Ingreso esperado", unit: "COP", lowerIsBetter: false },
  { id: "overdue_activities", label: "Actividades vencidas", unit: "actividades", lowerIsBetter: true },
  { id: "max_avg_stage_age_days", label: "Antigüedad promedio máxima", unit: "días", lowerIsBetter: true },
] as const;

export function metricActual(kpi: SalesKpi, metric: string): number | null {
  switch (metric) {
    case "open_count":
      return kpi.open;
    case "won_count":
      return kpi.won;
    case "win_rate":
      return kpi.winRate == null ? null : Math.round(kpi.winRate * 1000) / 10;
    case "expected_revenue":
      return Math.round(kpi.expectedRevenue);
    case "overdue_activities":
      return kpi.overdueActivities;
    case "max_avg_stage_age_days":
      return kpi.stageAging.reduce((max, stage) => Math.max(max, stage.avgDays), 0);
    default:
      return null;
  }
}
