import type { CommitteeAction, CommitteeDoc, Pendiente, PendienteStatus, Topic } from "@/lib/committee/types";

const STATUSES: PendienteStatus[] = ["pendiente", "en_curso", "cerrado"];

function clone(doc: CommitteeDoc): CommitteeDoc {
  return structuredClone(doc);
}

function requireTopic(doc: CommitteeDoc, topicId: string): Topic {
  const topic = doc.topics.find((item) => item.id === topicId);
  if (!topic) throw new Error("No se encontró el tema.");
  return topic;
}

function requirePunto(topic: Topic, puntoId: string) {
  const punto = topic.puntos.find((item) => item.id === puntoId);
  if (!punto) throw new Error("No se encontró el punto.");
  return punto;
}

function requirePendiente(doc: CommitteeDoc, topicId: string, puntoId: string, pendienteId: string): Pendiente {
  const pendiente = requirePunto(requireTopic(doc, topicId), puntoId).pendientes.find((item) => item.id === pendienteId);
  if (!pendiente) throw new Error("No se encontró el pendiente.");
  return pendiente;
}

function ensurePeople(doc: CommitteeDoc, names: string[]) {
  let order = doc.people.reduce((max, person) => Math.max(max, person.sortOrder), 0);
  for (const name of names) {
    if (!name || doc.people.some((person) => person.name === name)) continue;
    order += 1;
    doc.people.push({ name, sortOrder: order, custom: true });
  }
}

function bornOnFor(doc: CommitteeDoc, number: number): string {
  const entry = doc.calendar.find((item) => item.number === number);
  if (!entry) throw new Error("Ese comité no está en el calendario.");
  return entry.heldOn;
}

export function createNextCommittee(doc: CommitteeDoc, heldOn: string): { archived: CommitteeDoc; next: CommitteeDoc } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) throw new Error("La fecha del comité no es válida.");
  const archived = clone(doc);
  const number = doc.committee.number + 1;
  const calendar = doc.calendar.some((item) => item.number === number)
    ? clone(doc).calendar
    : [...doc.calendar.map((item) => ({ ...item })), { number, heldOn }];
  const topics = [];
  for (const topic of doc.topics) {
    const puntos = [];
    for (const punto of topic.puntos) {
      const open = punto.pendientes.filter((item) => item.status !== "cerrado").map((item) => structuredClone(item));
      if (open.length === 0 && punto.pendientes.length > 0) continue;
      puntos.push({ ...structuredClone(punto), pendientes: open });
    }
    if (!puntos.length) continue;
    topics.push({ ...structuredClone(topic), decisions: structuredClone(topic.decisions), puntos });
  }
  const next: CommitteeDoc = {
    committee: { ...doc.committee, number, heldOn },
    calendar,
    topics,
    people: structuredClone(doc.people),
  };
  return { archived, next };
}

export function applyAction(doc: CommitteeDoc, action: CommitteeAction): CommitteeDoc {
  if (action.type === "newCommittee") return createNextCommittee(doc, action.heldOn).next;
  const next = clone(doc);

  switch (action.type) {
    case "patchCommittee": {
      if (action.patch.heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(action.patch.heldOn)) {
        throw new Error("La fecha del comité no es válida.");
      }
      Object.assign(next.committee, action.patch);
      const current = next.calendar.find((item) => item.number === next.committee.number);
      if (current) current.heldOn = next.committee.heldOn;
      return next;
    }
    case "patchTopic": {
      const topic = requireTopic(next, action.topicId);
      if (action.patch.minutes != null && action.patch.minutes < 0) throw new Error("Los minutos no pueden ser negativos.");
      Object.assign(topic, action.patch);
      return next;
    }
    case "addTopic": {
      const number = next.topics.reduce((max, topic) => Math.max(max, topic.number), 0) + 1;
      next.topics.push({
        id: action.id,
        number,
        title: "Nuevo tema",
        context: "",
        minutes: 5,
        tags: [],
        decisions: [],
        puntos: [],
      });
      return next;
    }
    case "deleteTopic": {
      next.topics = next.topics.filter((topic) => topic.id !== action.topicId);
      return next;
    }
    case "addDecision": {
      requireTopic(next, action.topicId).decisions.push({ id: action.id, body: action.body });
      return next;
    }
    case "patchDecision": {
      const decision = requireTopic(next, action.topicId).decisions.find((item) => item.id === action.decisionId);
      if (!decision) throw new Error("No se encontró la decisión.");
      decision.body = action.body;
      return next;
    }
    case "deleteDecision": {
      const topic = requireTopic(next, action.topicId);
      topic.decisions = topic.decisions.filter((item) => item.id !== action.decisionId);
      return next;
    }
    case "addPunto": {
      requireTopic(next, action.topicId).puntos.push({
        id: action.id,
        title: "",
        subtitle: "",
        context: "",
        acta: null,
        links: [],
        leadImportKey: null,
        pendientes: [],
      });
      return next;
    }
    case "patchPunto": {
      Object.assign(requirePunto(requireTopic(next, action.topicId), action.puntoId), action.patch);
      return next;
    }
    case "deletePunto": {
      const topic = requireTopic(next, action.topicId);
      topic.puntos = topic.puntos.filter((punto) => punto.id !== action.puntoId);
      return next;
    }
    case "addLink": {
      requirePunto(requireTopic(next, action.topicId), action.puntoId).links.push({
        id: action.id,
        label: action.label.trim() || "Enlace",
        url: action.url.trim(),
      });
      return next;
    }
    case "deleteLink": {
      const punto = requirePunto(requireTopic(next, action.topicId), action.puntoId);
      punto.links = punto.links.filter((link) => link.id !== action.linkId);
      return next;
    }
    case "linkPunto": {
      requirePunto(requireTopic(next, action.topicId), action.puntoId).leadImportKey = action.leadImportKey;
      return next;
    }
    case "addPendiente": {
      requirePunto(requireTopic(next, action.topicId), action.puntoId).pendientes.push({
        id: action.id,
        title: "",
        status: "pendiente",
        owners: [],
        dueOn: null,
        bornCommitteeNumber: next.committee.number,
        bornOn: next.committee.heldOn,
        closedInCommitteeNumber: null,
        leadImportKey: null,
      });
      return next;
    }
    case "patchPendiente": {
      const pendiente = requirePendiente(next, action.topicId, action.puntoId, action.pendienteId);
      if (action.patch.status && !STATUSES.includes(action.patch.status)) throw new Error("Estado inválido.");
      if (action.patch.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(action.patch.dueOn)) throw new Error("Fecha inválida.");
      if (action.patch.bornCommitteeNumber != null) {
        pendiente.bornOn = bornOnFor(next, action.patch.bornCommitteeNumber);
        pendiente.bornCommitteeNumber = action.patch.bornCommitteeNumber;
      }
      if (action.patch.status && action.patch.status !== pendiente.status) {
        if (action.patch.status === "cerrado") pendiente.closedInCommitteeNumber = next.committee.number;
        else pendiente.closedInCommitteeNumber = null;
      }
      const { bornCommitteeNumber: _ignored, ...rest } = action.patch;
      Object.assign(pendiente, rest);
      return next;
    }
    case "deletePendiente": {
      const punto = requirePunto(requireTopic(next, action.topicId), action.puntoId);
      punto.pendientes = punto.pendientes.filter((item) => item.id !== action.pendienteId);
      return next;
    }
    case "setOwners": {
      const owners = [...new Set(action.owners.map((name) => name.trim()).filter(Boolean))];
      ensurePeople(next, owners);
      requirePendiente(next, action.topicId, action.puntoId, action.pendienteId).owners = owners;
      return next;
    }
    case "addPerson": {
      const name = action.name.trim();
      if (!name) throw new Error("El nombre está vacío.");
      ensurePeople(next, [name]);
      return next;
    }
    default:
      return next;
  }
}
