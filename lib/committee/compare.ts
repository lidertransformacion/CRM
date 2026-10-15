import type { CommitteeDoc, FlatPendiente } from "@/lib/committee/types";
import { carryCount, flatten, isOpen } from "@/lib/committee/metrics";

export type Cohort = {
  number: number;
  heldOn: string;
  born: number;
  stillOpen: number;
  closed: number;
};

export type DiffRow = {
  id: string;
  title: string;
  topic: string;
  punto: string;
  change: string;
};

function index(doc: CommitteeDoc): Map<string, FlatPendiente> {
  return new Map(flatten(doc).map((row) => [row.pendiente.id, row]));
}

export function diffDocuments(left: CommitteeDoc, right: CommitteeDoc): { closedBetween: DiffRow[]; added: DiffRow[]; stillOpen: DiffRow[] } {
  const a = index(left);
  const b = index(right);
  const closedBetween: DiffRow[] = [];
  const added: DiffRow[] = [];
  const stillOpen: DiffRow[] = [];
  for (const [id, row] of a) {
    const other = b.get(id);
    if (!other) {
      closedBetween.push(toDiff(row, "Salió del tablero"));
      continue;
    }
    if (isOpen(row.pendiente) && !isOpen(other.pendiente)) closedBetween.push(toDiff(other, "Se cerró"));
    else if (isOpen(other.pendiente)) stillOpen.push(toDiff(other, `Sigue abierto · ${carryCount(right, other.pendiente)} comités`));
  }
  for (const [id, row] of b) {
    if (!a.has(id)) added.push(toDiff(row, "Nuevo en este comité"));
  }
  return { closedBetween, added, stillOpen };
}

function toDiff(row: FlatPendiente, change: string): DiffRow {
  return {
    id: row.pendiente.id,
    title: row.pendiente.title.trim() || `(${row.punto.title})`,
    topic: row.topic.title,
    punto: row.punto.title,
    change,
  };
}

export function cohortsFromDocs(docs: CommitteeDoc[]): Cohort[] {
  const ordered = [...docs].sort((a, b) => a.committee.number - b.committee.number);
  const merged = new Map<string, { row: FlatPendiente; doc: CommitteeDoc }>();
  for (const doc of ordered) {
    for (const row of flatten(doc)) merged.set(row.pendiente.id, { row, doc });
  }
  const current = ordered[ordered.length - 1];
  const calendar = current?.calendar ?? [];
  return calendar.map((entry) => {
    const born = [...merged.values()].filter((item) => item.row.pendiente.bornCommitteeNumber === entry.number);
    const stillOpen = born.filter((item) => isOpen(item.row.pendiente)).length;
    return {
      number: entry.number,
      heldOn: entry.heldOn,
      born: born.length,
      stillOpen,
      closed: born.length - stillOpen,
    };
  });
}
