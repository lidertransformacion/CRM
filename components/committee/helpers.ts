import { carryCount, isCarried, isOpen, isOverdue, matchesPerson } from "@/lib/committee/metrics";
import type { CommitteeDoc, FlatPendiente, Pendiente, PendienteStatus, Punto, Topic } from "@/lib/committee/types";
import { daysBetween, shortDate } from "@/lib/utils";

/** Etiquetas de área que puede llevar un tema. */
export const TAGS = ["Operaciones", "Logística", "IT", "Mercadeo", "Finanzas"] as const;

export const STATUS_ORDER: PendienteStatus[] = ["pendiente", "en_curso", "cerrado"];
export const STATUS_META: Record<PendienteStatus, { label: string; tone: "neutral" | "info" | "ok" }> = {
  pendiente: { label: "Pendiente", tone: "neutral" },
  en_curso: { label: "En curso", tone: "info" },
  cerrado: { label: "Cerrado", tone: "ok" },
};

export const UNASSIGNED_KEY = "__none__";
export const UNASSIGNED_LABEL = "Sin responsable";

export type Scope = "open" | "all" | "closed";
export type Focus = "overdue" | "carried" | "closedSince" | null;
export type ViewMode = "topic" | "person";
export type SaveState = "saved" | "saving" | "error";

/**
 * Filtros del tablero. `born` solo se usa en modo cohorte (comités 1-6): limita a los
 * pendientes que nacieron en ese comité dentro del acta actual.
 */
export type Filters = { scope: Scope; focus: Focus; person: string | null; born: number | null };

export const DEFAULT_FILTERS: Filters = { scope: "open", focus: null, person: null, born: null };

export type Target = { topicId: string; puntoId: string; pendienteId?: string };

/** Diálogos que abre una fila de pendiente. */
export type RowDialog =
  | { kind: "link"; target: Target; current: string | null }
  | { kind: "origin"; target: Required<Target>; current: number }
  | { kind: "delete"; target: Required<Target>; title: string };

/** Diálogos del tablero: los de la fila más los de punto, decisión y tema. */
export type BoardDialog =
  | RowDialog
  | { kind: "attach"; target: Target }
  | { kind: "deletePunto"; target: Target; title: string; count: number }
  | { kind: "deleteDecision"; topicId: string; decisionId: string; body: string }
  | { kind: "deleteTopic"; topicId: string; title: string; puntos: number; pendientes: number };

/** Un filtro "estrecho" oculta puntos y temas sin coincidencias en vez de mostrarlos vacíos. */
export function isNarrow(filters: Filters): boolean {
  return filters.person != null || filters.focus != null || filters.born != null;
}

export function closedSince(doc: CommitteeDoc, item: Pendiente): boolean {
  return item.status === "cerrado" && item.closedInCommitteeNumber === doc.committee.number;
}

export function matchesFilters(doc: CommitteeDoc, item: Pendiente, filters: Filters, asOf: string): boolean {
  if (filters.born != null && item.bornCommitteeNumber !== filters.born) return false;
  if (!matchesPerson(item, filters.person)) return false;
  if (filters.focus === "overdue") return isOverdue(item, asOf);
  if (filters.focus === "carried") return isCarried(doc, item);
  if (filters.focus === "closedSince") return closedSince(doc, item);
  if (filters.scope === "open") return isOpen(item);
  if (filters.scope === "closed") return !isOpen(item);
  return true;
}

function showsEmpty(filters: Filters): boolean {
  return !isNarrow(filters) && filters.scope !== "closed";
}

export function visiblePuntos(doc: CommitteeDoc, topic: Topic, filters: Filters, asOf: string): Punto[] {
  const empty = showsEmpty(filters);
  return topic.puntos.filter(
    (punto) => punto.pendientes.some((item) => matchesFilters(doc, item, filters, asOf)) || (empty && punto.pendientes.length === 0),
  );
}

export function topicVisible(doc: CommitteeDoc, topic: Topic, filters: Filters, asOf: string): boolean {
  return visiblePuntos(doc, topic, filters, asOf).length > 0 || (showsEmpty(filters) && topic.puntos.length === 0);
}

export type RowSummary = { open: number; closed: number; total: number; overdue: number; carried: number; closedSince: number };

export function summarize(doc: CommitteeDoc, rows: FlatPendiente[], asOf: string): RowSummary {
  const summary: RowSummary = { open: 0, closed: 0, total: rows.length, overdue: 0, carried: 0, closedSince: 0 };
  for (const row of rows) {
    const item = row.pendiente;
    if (isOpen(item)) summary.open += 1;
    else summary.closed += 1;
    if (isOverdue(item, asOf)) summary.overdue += 1;
    if (isCarried(doc, item)) summary.carried += 1;
    if (closedSince(doc, item)) summary.closedSince += 1;
  }
  return summary;
}

export type PersonSummary = RowSummary & { key: string; name: string; unassigned: boolean; sortOrder: number };

/** Resumen por responsable sobre un conjunto de filas (abiertos, cerrados, vencidos, arrastrados). */
export function peopleSummary(doc: CommitteeDoc, rows: FlatPendiente[], asOf: string): PersonSummary[] {
  const buckets = new Map<string, { key: string; name: string; unassigned: boolean; sortOrder: number; rows: FlatPendiente[] }>();
  for (const person of doc.people) {
    buckets.set(person.name, { key: person.name, name: person.name, unassigned: false, sortOrder: person.sortOrder, rows: [] });
  }
  const unassigned = { key: UNASSIGNED_KEY, name: UNASSIGNED_LABEL, unassigned: true, sortOrder: 10_000, rows: [] as FlatPendiente[] };
  for (const row of rows) {
    const owners = row.pendiente.owners.length ? row.pendiente.owners : [null];
    for (const owner of owners) {
      if (owner == null) {
        unassigned.rows.push(row);
        continue;
      }
      let bucket = buckets.get(owner);
      if (!bucket) {
        bucket = { key: owner, name: owner, unassigned: false, sortOrder: 9_000, rows: [] };
        buckets.set(owner, bucket);
      }
      bucket.rows.push(row);
    }
  }
  const all = [...buckets.values(), unassigned]
    .filter((bucket) => bucket.rows.length > 0)
    .map((bucket) => ({ key: bucket.key, name: bucket.name, unassigned: bucket.unassigned, sortOrder: bucket.sortOrder, ...summarize(doc, bucket.rows, asOf) }));
  all.sort((a, b) => b.open - a.open || Number(a.unassigned) - Number(b.unassigned) || a.sortOrder - b.sortOrder);
  return all;
}

/** Orden de lectura de pendientes: más arrastre primero, luego fecha más cercana, luego número de tema. */
export function sortRows(doc: CommitteeDoc, rows: FlatPendiente[]): FlatPendiente[] {
  return [...rows].sort(
    (a, b) =>
      carryCount(doc, b.pendiente) - carryCount(doc, a.pendiente) ||
      (a.pendiente.dueOn ?? "9999-99-99").localeCompare(b.pendiente.dueOn ?? "9999-99-99") ||
      a.topic.number - b.topic.number,
  );
}

export type OwnerGroup = { key: string; name: string; summary: PersonSummary; rows: FlatPendiente[] };

/** Agrupa filas por responsable (una fila con dos responsables aparece en los dos grupos). */
export function groupRowsByOwner(doc: CommitteeDoc, rows: FlatPendiente[], asOf: string): OwnerGroup[] {
  const people = peopleSummary(doc, rows, asOf);
  return people.map((person) => ({
    key: person.key,
    name: person.name,
    summary: person,
    rows: sortRows(
      doc,
      rows.filter((row) => (person.unassigned ? row.pendiente.owners.length === 0 : row.pendiente.owners.includes(person.key))),
    ),
  }));
}

export type DueBadge = { label: string; tone: "danger" | "warn"; tooltip: string };

/** Badge de vencimiento: solo para pendientes abiertos con fecha vencida o próxima (≤ 7 días). */
export function dueBadge(item: Pendiente, asOf: string): DueBadge | null {
  if (!item.dueOn || !isOpen(item)) return null;
  const days = daysBetween(asOf, item.dueOn);
  if (days < 0) {
    const late = Math.abs(days);
    return { label: "Vencido", tone: "danger", tooltip: `Venció el ${shortDate(item.dueOn)}: ${plural(late, "día", "días")} de retraso y sigue abierto` };
  }
  if (days === 0) return { label: "Vence hoy", tone: "warn", tooltip: "La fecha límite es hoy" };
  if (days === 1) return { label: "Vence mañana", tone: "warn", tooltip: `Fecha límite: ${shortDate(item.dueOn)}` };
  if (days <= 7) return { label: `Vence en ${days} días`, tone: "warn", tooltip: `Fecha límite: ${shortDate(item.dueOn)}` };
  return null;
}

export type CarryBadge = { carry: number; label: string; tone: "neutral" | "warn" | "danger"; tooltip: string };

/** Antigüedad del pendiente: comité actual − comité de nacimiento. Ámbar con 1, rojo con 2 o más. */
export function carryBadge(doc: CommitteeDoc, item: Pendiente): CarryBadge {
  const carry = carryCount(doc, item);
  const born = `comité #${item.bornCommitteeNumber} (${shortDate(item.bornOn)})`;
  const open = isOpen(item);
  if (carry <= 0) {
    return { carry, label: "Nuevo", tone: "neutral", tooltip: `Nació en este comité: #${item.bornCommitteeNumber} · ${shortDate(item.bornOn)}` };
  }
  const age = plural(carry, "comité sin cerrar", "comités sin cerrar");
  if (!open) {
    return { carry, label: plural(carry, "comité", "comités"), tone: "neutral", tooltip: `Nació en el ${born} · cerrado en el comité #${item.closedInCommitteeNumber ?? doc.committee.number}` };
  }
  return { carry, label: plural(carry, "comité", "comités"), tone: carry >= 2 ? "danger" : "warn", tooltip: `Nació en el ${born} · ${age}` };
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Traduce `?persona=` a la clave interna (nombre exacto de la lista o "Sin responsable"). */
export function resolvePersonKey(doc: CommitteeDoc, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return null;
  if (wanted === UNASSIGNED_LABEL.toLowerCase() || wanted === UNASSIGNED_KEY) return UNASSIGNED_KEY;
  const found = doc.people.find((person) => person.name.toLowerCase() === wanted);
  return found ? found.name : raw.trim();
}

export function personLabel(key: string | null): string {
  if (!key) return "";
  return key === UNASSIGNED_KEY ? UNASSIGNED_LABEL : key;
}
