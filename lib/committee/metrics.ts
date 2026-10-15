import { topicShortName } from "@/lib/utils";
import type { CommitteeDoc, FlatPendiente, Pendiente, Punto, Topic } from "@/lib/committee/types";

export function flatten(doc: CommitteeDoc): FlatPendiente[] {
  const rows: FlatPendiente[] = [];
  for (const topic of doc.topics) {
    for (const punto of topic.puntos) {
      for (const pendiente of punto.pendientes) {
        rows.push({ topic, punto, pendiente });
      }
    }
  }
  return rows;
}

export function isOpen(pendiente: Pendiente): boolean {
  return pendiente.status !== "cerrado";
}

export function carryCount(doc: CommitteeDoc, pendiente: Pendiente): number {
  return Math.max(0, doc.committee.number - pendiente.bornCommitteeNumber);
}

export function isOverdue(pendiente: Pendiente, asOf: string): boolean {
  return isOpen(pendiente) && !!pendiente.dueOn && pendiente.dueOn < asOf;
}

export function isCarried(doc: CommitteeDoc, pendiente: Pendiente): boolean {
  return isOpen(pendiente) && carryCount(doc, pendiente) >= 2;
}

export function topicIsClosed(topic: Topic): boolean {
  const items = topic.puntos.flatMap((punto) => punto.pendientes);
  return items.length > 0 && items.every((item) => item.status === "cerrado");
}

export function puntoHasOpen(punto: Punto): boolean {
  return punto.pendientes.some(isOpen);
}

export type BoardStats = {
  open: number;
  closed: number;
  overdue: number;
  carried: number;
};

export function boardStats(doc: CommitteeDoc, asOf: string): BoardStats {
  const rows = flatten(doc);
  return {
    open: rows.filter((row) => isOpen(row.pendiente)).length,
    closed: rows.filter((row) => !isOpen(row.pendiente)).length,
    overdue: rows.filter((row) => isOverdue(row.pendiente, asOf)).length,
    carried: rows.filter((row) => isCarried(doc, row.pendiente)).length,
  };
}

export type PersonStat = {
  key: string;
  name: string;
  open: number;
  overdue: number;
  carried: number;
  unassigned: boolean;
  sortOrder: number;
};

export function personStats(doc: CommitteeDoc, asOf: string): PersonStat[] {
  const named = new Map<string, PersonStat>();
  for (const person of doc.people) {
    named.set(person.name, {
      key: person.name,
      name: person.name,
      open: 0,
      overdue: 0,
      carried: 0,
      unassigned: false,
      sortOrder: person.sortOrder,
    });
  }
  const unassigned: PersonStat = {
    key: "__none__",
    name: "Sin responsable",
    open: 0,
    overdue: 0,
    carried: 0,
    unassigned: true,
    sortOrder: 10_000,
  };

  for (const row of flatten(doc)) {
    if (!isOpen(row.pendiente)) continue;
    const targets = row.pendiente.owners.length ? row.pendiente.owners : [null];
    for (const owner of targets) {
      const bucket = owner ? named.get(owner) : unassigned;
      if (!bucket) continue;
      bucket.open += 1;
      if (isOverdue(row.pendiente, asOf)) bucket.overdue += 1;
      if (isCarried(doc, row.pendiente)) bucket.carried += 1;
    }
  }

  const visible = [...named.values()].filter((person) => person.open > 0);
  if (unassigned.open > 0) visible.push(unassigned);
  visible.sort((a, b) => b.open - a.open || Number(a.unassigned) - Number(b.unassigned) || a.sortOrder - b.sortOrder);
  return visible;
}

export function topicStats(doc: CommitteeDoc, topic: Topic) {
  const items = topic.puntos.flatMap((punto) => punto.pendientes);
  return {
    open: items.filter(isOpen).length,
    carried: items.filter((item) => isCarried(doc, item)).length,
    closed: items.filter((item) => !isOpen(item)).length,
  };
}

export function closedSinceLast(doc: CommitteeDoc): FlatPendiente[] {
  return flatten(doc)
    .filter((row) => row.pendiente.status === "cerrado" && row.pendiente.closedInCommitteeNumber === doc.committee.number)
    .sort((a, b) => a.topic.number - b.topic.number || doc.topics.indexOf(a.topic) - doc.topics.indexOf(b.topic));
}

export function matchesPerson(pendiente: Pendiente, personKey: string | null): boolean {
  if (!personKey) return true;
  if (personKey === "__none__") return pendiente.owners.length === 0;
  return pendiente.owners.includes(personKey);
}

export function carryTone(carry: number): "new" | "amber" | "red" {
  if (carry >= 2) return "red";
  if (carry === 1) return "amber";
  return "new";
}

export function closedItemLabel(row: FlatPendiente): string {
  const title = row.pendiente.title.trim();
  if (!title) return `(${row.punto.title})`;
  return title;
}

export function emailTopicLabel(topic: Topic): string {
  return topicShortName(topic.title);
}
