import type { LeadRecord } from "@/lib/db";
import { STAGES, stageOf } from "@/lib/odoo/stages";
import { cop, shortDate } from "@/lib/utils";

/** Grupo visual de una etapa: define color de columna, badge y qué columnas van colapsadas. */
export type StageGroup = "open" | "won" | "recurrent" | "lost";

/** Filtro de alcance que aplican los indicadores de arriba ("Abiertas", "Ganadas"…). */
export type Bucket = "all" | StageGroup;

type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info" | "outline";

export const GROUP_META: Record<StageGroup, { label: string; plural: string; badge: BadgeTone; line: string; text: string; soft: string }> = {
  open: { label: "Abierta", plural: "Abiertas", badge: "neutral", line: "border-t-navy", text: "text-navy", soft: "bg-accent-soft" },
  won: { label: "Ganada", plural: "Ganadas", badge: "ok", line: "border-t-ok", text: "text-ok", soft: "bg-ok-soft" },
  recurrent: { label: "Recurrente", plural: "Recurrentes", badge: "info", line: "border-t-info", text: "text-info", soft: "bg-info-soft" },
  lost: { label: "Perdida", plural: "Perdidas", badge: "danger", line: "border-t-danger", text: "text-danger", soft: "bg-danger-soft" },
};

export function stageGroup(stage: string): StageGroup {
  if (stage === "CIERRE/ GANADO") return "won";
  if (stage === "CLIENTE RECURRENTE") return "recurrent";
  if (stage === "OPORTUNIDAD PERDIDA") return "lost";
  return "open";
}

export function stageShort(stage: string): string {
  return stageOf(stage)?.short ?? stage;
}

export function stagePosition(stage: string): number {
  return stageOf(stage)?.position ?? STAGES.length + 1;
}

export const OPEN_STAGE_DEFS = STAGES.filter((stage) => stageGroup(stage.name) === "open");
export const CLOSED_STAGE_DEFS = STAGES.filter((stage) => stageGroup(stage.name) !== "open");

/** Una oportunidad tiene actividad vencida cuando su próxima actividad quedó antes de hoy. */
export function isOverdue(lead: Pick<LeadRecord, "next_activity_deadline">, today: string): boolean {
  return !!lead.next_activity_deadline && lead.next_activity_deadline.slice(0, 10) < today;
}

export function weightedRevenue(lead: Pick<LeadRecord, "expected_revenue" | "probability">): number {
  return (lead.expected_revenue ?? 0) * ((lead.probability ?? 0) / 100);
}

export function sumRevenue(leads: Pick<LeadRecord, "expected_revenue">[]): number {
  return leads.reduce((sum, lead) => sum + (lead.expected_revenue ?? 0), 0);
}

/** "$ 1.250 M" / "$ 850 k": para cabeceras estrechas donde el COP completo no cabe. */
export function compactCop(value: number): string {
  if (value >= 1_000_000) {
    return `$ ${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: value >= 100_000_000 ? 0 : 1 })} M`;
  }
  if (value >= 1_000) return `$ ${Math.round(value / 1_000).toLocaleString("es-CO")} k`;
  return cop(value);
}

/** "15 sep 2026": fecha corta con año, para fichas donde conviven varios años. */
export function fullDate(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  return `${shortDate(iso)} ${iso.slice(0, 4)}`;
}

export type SortKey = "customer" | "name" | "stage" | "salesperson" | "expected_revenue" | "probability" | "next_activity_deadline" | "created_at";
export type SortDir = "asc" | "desc";

/** Orden por defecto de cada columna: fechas y texto ascendente, dinero y probabilidad descendente. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  customer: "asc",
  name: "asc",
  stage: "asc",
  salesperson: "asc",
  expected_revenue: "desc",
  probability: "desc",
  next_activity_deadline: "asc",
  created_at: "desc",
};

function compareNullable<T>(a: T | null | undefined, b: T | null | undefined, compare: (x: T, y: T) => number, dir: SortDir): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // los vacíos siempre al final
  if (bEmpty) return -1;
  const result = compare(a as T, b as T);
  return dir === "asc" ? result : -result;
}

export function compareLeads(a: LeadRecord, b: LeadRecord, key: SortKey, dir: SortDir): number {
  const text = (x: string, y: string) => x.localeCompare(y, "es", { sensitivity: "base" });
  const number = (x: number, y: number) => x - y;
  switch (key) {
    case "customer":
      return compareNullable(a.customer || a.name, b.customer || b.name, text, dir);
    case "name":
      return compareNullable(a.name, b.name, text, dir);
    case "salesperson":
      return compareNullable(a.salesperson, b.salesperson, text, dir);
    case "stage":
      return compareNullable(stagePosition(a.stage), stagePosition(b.stage), number, dir);
    case "expected_revenue":
      return compareNullable(a.expected_revenue, b.expected_revenue, number, dir);
    case "probability":
      return compareNullable(a.probability, b.probability, number, dir);
    case "next_activity_deadline":
      return compareNullable(a.next_activity_deadline, b.next_activity_deadline, text, dir);
    case "created_at":
      return compareNullable(a.created_at, b.created_at, text, dir);
  }
}
