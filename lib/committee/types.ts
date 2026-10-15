export type PendienteStatus = "pendiente" | "en_curso" | "cerrado";

export type Person = {
  name: string;
  sortOrder: number;
  custom: boolean;
};

export type LinkItem = {
  id: string;
  label: string;
  url: string;
};

export type Pendiente = {
  id: string;
  title: string;
  status: PendienteStatus;
  owners: string[];
  dueOn: string | null;
  bornCommitteeNumber: number;
  bornOn: string;
  closedInCommitteeNumber: number | null;
  leadImportKey: string | null;
};

export type Punto = {
  id: string;
  title: string;
  subtitle: string;
  context: string;
  acta: string | null;
  links: LinkItem[];
  leadImportKey: string | null;
  pendientes: Pendiente[];
};

export type Decision = {
  id: string;
  body: string;
};

export type Topic = {
  id: string;
  number: number;
  title: string;
  context: string;
  minutes: number | null;
  tags: string[];
  decisions: Decision[];
  puntos: Punto[];
};

export type CommitteeMeta = {
  number: number;
  title: string;
  area: string;
  heldOn: string;
  signatureName: string;
};

export type CalendarEntry = {
  number: number;
  heldOn: string;
};

export type CommitteeDoc = {
  committee: CommitteeMeta;
  calendar: CalendarEntry[];
  topics: Topic[];
  people: Person[];
};

export type FlatPendiente = {
  pendiente: Pendiente;
  punto: Punto;
  topic: Topic;
};

export type CommitteeAction =
  | { type: "patchCommittee"; patch: Partial<Pick<CommitteeMeta, "title" | "heldOn" | "signatureName" | "area">> }
  | { type: "patchTopic"; topicId: string; patch: Partial<Pick<Topic, "number" | "title" | "context" | "minutes" | "tags">> }
  | { type: "addTopic"; id: string }
  | { type: "deleteTopic"; topicId: string }
  | { type: "addDecision"; topicId: string; id: string; body: string }
  | { type: "patchDecision"; topicId: string; decisionId: string; body: string }
  | { type: "deleteDecision"; topicId: string; decisionId: string }
  | { type: "addPunto"; topicId: string; id: string }
  | { type: "patchPunto"; topicId: string; puntoId: string; patch: Partial<Pick<Punto, "title" | "subtitle" | "context" | "acta">> }
  | { type: "deletePunto"; topicId: string; puntoId: string }
  | { type: "addLink"; topicId: string; puntoId: string; id: string; label: string; url: string }
  | { type: "deleteLink"; topicId: string; puntoId: string; linkId: string }
  | { type: "linkPunto"; topicId: string; puntoId: string; leadImportKey: string | null }
  | { type: "addPendiente"; topicId: string; puntoId: string; id: string }
  | {
      type: "patchPendiente";
      topicId: string;
      puntoId: string;
      pendienteId: string;
      patch: Partial<Pick<Pendiente, "title" | "status" | "dueOn" | "bornCommitteeNumber" | "leadImportKey">>;
    }
  | { type: "deletePendiente"; topicId: string; puntoId: string; pendienteId: string }
  | { type: "setOwners"; topicId: string; puntoId: string; pendienteId: string; owners: string[] }
  | { type: "addPerson"; name: string }
  | { type: "newCommittee"; heldOn: string };
