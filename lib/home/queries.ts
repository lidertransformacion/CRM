import { activityRows, currentCommittee, getDb, lastMaintenanceMap, listEquipment, listLeads, type EquipmentRow, type LeadRecord } from "@/lib/db";
import { recordTiming } from "@/lib/observe";
import { readThrough } from "@/lib/sql/read-cache";
import type { SqlDb } from "@/lib/sql/types";
import { computeKpis, type LeadFact } from "@/lib/kpi/compute";
import { boardStats, carryCount, closedSinceLast, flatten, isCarried, isOpen, isOverdue, personStats } from "@/lib/committee/metrics";
import type { CommitteeDoc } from "@/lib/committee/types";
import { siteById } from "@/lib/equipment/catalog";
import { warrantyStateOn, type WarrantyState } from "@/lib/equipment/warranty";
import { OPEN_STAGES, stageOf } from "@/lib/odoo/stages";
import { daysBetween, displaySeller, todayIso, topicShortName } from "@/lib/utils";
import { joinSentence, plural } from "@/lib/home/format";
import { lastMaintenanceBySerial as lastMaintenanceRecord, nextMaintenanceDate } from "@/lib/equipment/queries";

/** Ventana (en días) para "por vencer": garantías y mantenimientos que caen dentro de ella se avisan en Inicio. */
export const SOON_DAYS = 30;

/** Filas máximas por lista en Inicio; lo demás se ve con "Ver todos". */
export const PENDIENTES_LIMIT = 8;
export const LEADS_LIMIT = 6;
export const EQUIPMENT_LIMIT = 6;

/** Estados de equipo que ya no requieren seguimiento. */
const INACTIVE_EQUIPMENT_STATUSES = new Set(["baja", "devuelto"]);

export type PendienteAlert = {
  id: string;
  title: string;
  owners: string[];
  dueOn: string | null;
  overdue: boolean;
  carry: number;
  bornCommitteeNumber: number;
  topic: string;
  href: string;
};

export type LeadAlert = {
  importKey: string;
  customer: string;
  name: string;
  seller: string;
  stage: string;
  deadline: string;
  daysLate: number;
  expectedRevenue: number | null;
  href: string;
};

export type EquipmentReason = "maintenance_overdue" | "warranty_expiring" | "warranty_expired" | "maintenance_soon" | "no_base";

export type EquipmentAlert = {
  serial: string;
  storeCode: string;
  name: string;
  /** Cliente si está en comodato; si no, la sede. */
  where: string;
  reason: EquipmentReason;
  reasonDate: string | null;
  /** Segundo motivo, si lo hay, en texto corto. */
  note: string | null;
  href: string;
};

export type EquipmentSummary = {
  rows: EquipmentAlert[];
  total: number;
  warrantyExpired: number;
  warrantyExpiring: number;
  maintenanceOverdue: number;
  maintenanceSoon: number;
  noBase: number;
};

export type CommitteeSummary = {
  number: number;
  heldOn: string;
  open: number;
  closed: number;
  overdue: number;
  carried: number;
  closedThisCommittee: number;
  /** Responsables con más pendientes abiertos (máximo 4). */
  people: { name: string; open: number; overdue: number; href: string }[];
};

export type HomeData = {
  asOf: string;
  committee: CommitteeSummary;
  pendientes: { rows: PendienteAlert[]; total: number };
  leads: { rows: LeadAlert[]; total: number };
  equipment: EquipmentSummary;
  revenue: { expected: number; weighted: number; openCount: number };
};

function personHref(name: string | null): string {
  return name ? `/comites?persona=${encodeURIComponent(name)}` : "/comites";
}

/** Pendientes abiertos que ya vencieron o llevan 2 o más comités, los más urgentes primero. */
export function pendienteAlerts(doc: CommitteeDoc, asOf: string): PendienteAlert[] {
  return flatten(doc)
    .filter((row) => isOpen(row.pendiente) && (isOverdue(row.pendiente, asOf) || isCarried(doc, row.pendiente)))
    .map((row) => ({
      id: row.pendiente.id,
      title: row.pendiente.title.trim() || `(${row.punto.title})`,
      owners: row.pendiente.owners,
      dueOn: row.pendiente.dueOn,
      overdue: isOverdue(row.pendiente, asOf),
      carry: carryCount(doc, row.pendiente),
      bornCommitteeNumber: row.pendiente.bornCommitteeNumber,
      topic: topicShortName(row.topic.title),
      href: personHref(row.pendiente.owners[0] ?? null),
    }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.carry - a.carry || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
}

/** Oportunidades en etapa abierta cuya próxima actividad ya venció. Las de mayor ingreso esperado primero. */
export function leadAlerts(leads: LeadRecord[], asOf: string): LeadAlert[] {
  return leads
    .filter((lead) => OPEN_STAGES.has(lead.stage) && !!lead.next_activity_deadline && lead.next_activity_deadline < asOf)
    .map((lead) => {
      const deadline = lead.next_activity_deadline!.slice(0, 10);
      return {
        importKey: lead.import_key,
        customer: lead.customer,
        name: lead.name,
        seller: displaySeller(lead.salesperson),
        stage: stageOf(lead.stage)?.short ?? lead.stage,
        deadline,
        daysLate: daysBetween(deadline, asOf),
        expectedRevenue: lead.expected_revenue,
        href: `/pipeline?lead=${encodeURIComponent(lead.import_key)}`,
      };
    })
    .sort((a, b) => (b.expectedRevenue ?? 0) - (a.expectedRevenue ?? 0) || a.deadline.localeCompare(b.deadline));
}

/** Último mantenimiento por serial en una sola consulta (evita una por equipo). */
export async function lastMaintenanceBySerial(db?: SqlDb): Promise<Map<string, string>> {
  return new Map(Object.entries(await lastMaintenanceRecord(db)));
}

type Reason = { reason: EquipmentReason; date: string | null; score: number };

/** Motivos de revisión de un equipo, del más urgente al menos. */
function equipmentReasons(row: EquipmentRow, lastMaintenance: Map<string, string>, asOf: string): Reason[] {
  const reasons: Reason[] = [];
  const base = lastMaintenance.get(row.serial) ?? row.delivered_on ?? null;
  const next = nextMaintenanceDate({ everyDays: row.maintenance_every_days, lastPerformedOn: lastMaintenance.get(row.serial) ?? null, deliveredOn: row.delivered_on });
  if (next && next < asOf) reasons.push({ reason: "maintenance_overdue", date: next, score: 100 });

  const warranty = warrantyStateOn(row.warranty_until, row.warranty_state as WarrantyState, asOf);
  if (warranty === "vigente" && row.warranty_until && daysBetween(asOf, row.warranty_until) <= SOON_DAYS) {
    reasons.push({ reason: "warranty_expiring", date: row.warranty_until, score: 90 });
  }
  if (warranty === "vencida") reasons.push({ reason: "warranty_expired", date: row.warranty_until, score: row.warranty_until ? 80 : 40 });

  if (next && next >= asOf && daysBetween(asOf, next) <= SOON_DAYS) reasons.push({ reason: "maintenance_soon", date: next, score: 60 });
  if (row.maintenance_every_days && !base) reasons.push({ reason: "no_base", date: null, score: 10 });

  return reasons.sort((a, b) => b.score - a.score);
}

const REASON_NOTE: Record<EquipmentReason, string> = {
  maintenance_overdue: "mantenimiento vencido",
  warranty_expiring: "garantía por vencer",
  warranty_expired: "garantía vencida",
  maintenance_soon: "mantenimiento próximo",
  no_base: "sin fecha base de mantenimiento",
};

/** Equipos con garantía vencida o por vencer, o con mantenimiento vencido, próximo o sin fecha base. */
export function equipmentAlerts(rows: EquipmentRow[], lastMaintenance: Map<string, string>, asOf: string, limit = EQUIPMENT_LIMIT): EquipmentSummary {
  const counts = { warrantyExpired: 0, warrantyExpiring: 0, maintenanceOverdue: 0, maintenanceSoon: 0, noBase: 0 };
  const scored: { alert: EquipmentAlert; score: number }[] = [];
  for (const row of rows) {
    if (INACTIVE_EQUIPMENT_STATUSES.has(row.status)) continue;
    const reasons = equipmentReasons(row, lastMaintenance, asOf);
    if (reasons.length === 0) continue;
    for (const item of reasons) {
      if (item.reason === "warranty_expired") counts.warrantyExpired += 1;
      if (item.reason === "warranty_expiring") counts.warrantyExpiring += 1;
      if (item.reason === "maintenance_overdue") counts.maintenanceOverdue += 1;
      if (item.reason === "maintenance_soon") counts.maintenanceSoon += 1;
      if (item.reason === "no_base") counts.noBase += 1;
    }
    const [primary, secondary] = reasons;
    const atClient = row.status === "en_comodato";
    scored.push({
      score: primary.score + (atClient ? 5 : 0),
      alert: {
        serial: row.serial,
        storeCode: row.store_code,
        name: row.name,
        where: (atClient && row.client_name) || siteById(row.site_id)?.name || row.site_id,
        reason: primary.reason,
        reasonDate: primary.date,
        note: secondary ? REASON_NOTE[secondary.reason] : null,
        href: `/comodatos/${encodeURIComponent(row.serial)}`,
      },
    });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.alert.reasonDate ?? "9999").localeCompare(b.alert.reasonDate ?? "9999") ||
      a.alert.storeCode.localeCompare(b.alert.storeCode, "es"),
  );
  return { rows: scored.slice(0, limit).map((item) => item.alert), total: scored.length, ...counts };
}

/** Resumen del comité actual: contadores y responsables con más carga. */
export function committeeSummary(doc: CommitteeDoc, asOf: string): CommitteeSummary {
  const stats = boardStats(doc, asOf);
  return {
    number: doc.committee.number,
    heldOn: doc.committee.heldOn,
    ...stats,
    closedThisCommittee: closedSinceLast(doc).length,
    people: personStats(doc, asOf)
      .slice(0, 4)
      .map((person) => ({ name: person.name, open: person.open, overdue: person.overdue, href: personHref(person.unassigned ? null : person.key) })),
  };
}

/** Todo lo que Inicio necesita, en objetos planos listos para renderizar. Se recalcula solo tras una escritura. */
export async function homeData(asOf = todayIso(), db?: SqlDb): Promise<HomeData> {
  const sql = db ?? (await getDb());
  return readThrough(sql, `home:${asOf}`, ["committee", "leads", "activities", "equipment", "maintenance"], async () => {
    const started = performance.now();
    const [committee, leads, equipmentRows, lastMaintenance, activities] = await Promise.all([
      currentCommittee(sql),
      listLeads(sql),
      listEquipment(sql),
      lastMaintenanceMap(sql),
      activityRows(sql),
    ]);
    recordTiming("db", performance.now() - started);
    const doc = committee.doc;
    const facts: LeadFact[] = leads.map((lead) => ({
      importKey: lead.import_key,
      name: lead.name,
      stage: lead.stage,
      salesperson: lead.salesperson,
      customer: lead.customer,
      expectedRevenue: lead.expected_revenue,
      probability: lead.probability,
      createdAt: lead.created_at,
      active: !!lead.active,
      wonStatus: lead.won_status,
    }));
    const kpis = computeKpis(
      facts,
      activities.map((activity) => ({ assignee: activity.assignee, deadline: activity.deadline, state: activity.state })),
      asOf,
    );
    const pendientes = pendienteAlerts(doc, asOf);
    const alerts = leadAlerts(leads, asOf);
    const equipment = equipmentAlerts(equipmentRows, new Map(Object.entries(lastMaintenance)), asOf);
    return {
      asOf,
      committee: committeeSummary(doc, asOf),
      pendientes: { rows: pendientes.slice(0, PENDIENTES_LIMIT), total: pendientes.length },
      leads: { rows: alerts.slice(0, LEADS_LIMIT), total: alerts.length },
      equipment,
      revenue: { expected: kpis.team.expectedRevenue, weighted: kpis.team.weightedRevenue, openCount: kpis.team.open },
    };
  });
}

/** Frase de la cabecera: lo que requiere atención hoy, en una línea. */
export function summaryLine(data: HomeData): string {
  const parts: string[] = [];
  const { overdue, carried } = data.committee;
  if (overdue) parts.push(plural(overdue, "pendiente vencido", "pendientes vencidos"));
  if (carried) parts.push(overdue ? plural(carried, "arrastrado", "arrastrados") : plural(carried, "pendiente arrastrado", "pendientes arrastrados"));
  if (data.leads.total) parts.push(plural(data.leads.total, "oportunidad con actividad vencida", "oportunidades con actividad vencida"));
  if (parts.length === 0) return "Nada vencido ni arrastrado. Buen momento para mover el pipeline.";
  return `${joinSentence(parts)}.`;
}
