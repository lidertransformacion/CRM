import { NextResponse } from "next/server";
import { clientDirectory, clientTimeline } from "@/lib/db";
import { isActivityOverdue } from "@/lib/kpi/compute";
import { OPEN_STAGES, stageOf } from "@/lib/odoo/stages";
import { activitiesForLeads } from "@/lib/pipeline/queries";
import { cop, displaySeller, stripHtml, todayIso } from "@/lib/utils";
import type { ClientTimelineResponse, TimelineEvent } from "@/components/clients/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  en_comodato: "En comodato",
  en_tienda: "En tienda",
  en_bodega: "En bodega",
  en_mantenimiento: "En mantenimiento",
  devuelto: "Devuelto",
  baja: "De baja",
};

/**
 * GET /api/clients               → directorio de clientes.
 * GET /api/clients?customer=Nombre → línea de tiempo enriquecida de ese cliente.
 */
export function GET(request: Request) {
  const customer = new URL(request.url).searchParams.get("customer");
  if (!customer) return NextResponse.json({ clients: clientDirectory() });

  const base = clientTimeline(customer);
  const today = todayIso();
  const activities = activitiesForLeads(base.leads.map((lead) => lead.import_key));
  const events: TimelineEvent[] = [];

  for (const lead of base.leads) {
    const stage = stageOf(lead.stage);
    const parts = [stage?.short ?? lead.stage, displaySeller(lead.salesperson)];
    if (lead.expected_revenue) parts.push(cop(lead.expected_revenue));
    events.push({
      at: (lead.created_at ?? "").slice(0, 10) || "1970-01-01",
      kind: "oportunidad",
      title: lead.name,
      detail: parts.join(" · "),
      href: `/pipeline?lead=${encodeURIComponent(lead.import_key)}`,
      alert: !!lead.next_activity_deadline && lead.next_activity_deadline < today && OPEN_STAGES.has(lead.stage),
    });
  }

  for (const activity of activities) {
    const overdue = isActivityOverdue({ assignee: activity.assignee, deadline: activity.deadline, state: activity.state }, today);
    const note = stripHtml(activity.note) || activity.summary;
    const parts = [overdue ? "Vencida" : activity.state || "Pendiente", displaySeller(activity.assignee)];
    if (note) parts.push(note);
    events.push({
      at: activity.deadline || (activity.created_at ?? "").slice(0, 10) || "1970-01-01",
      kind: "actividad",
      title: activity.activity_type || "Actividad",
      detail: parts.join(" · "),
      href: activity.lead_import_key ? `/pipeline?lead=${encodeURIComponent(activity.lead_import_key)}` : undefined,
      alert: overdue,
    });
  }

  for (const item of base.equipment) {
    events.push({
      at: item.delivered_on || item.created_at.slice(0, 10),
      kind: "comodato",
      title: `${item.store_code} · ${item.name}`,
      detail: [item.serial, STATUS_LABEL[item.status] ?? item.status, item.city].filter(Boolean).join(" · "),
      href: `/comodatos/${encodeURIComponent(item.serial)}`,
    });
  }

  for (const event of base.events) {
    if (event.kind !== "comité") continue;
    events.push({ ...event, kind: "comité", href: "/comites", alert: /abierto|pendiente/i.test(event.detail) && event.at < today });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  const open = base.leads.filter((lead) => OPEN_STAGES.has(lead.stage));
  const latest = [...open].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? base.leads[0];
  const payload: ClientTimelineResponse & { leads: typeof base.leads; equipment: typeof base.equipment } = {
    customer,
    summary: {
      opportunities: base.leads.length,
      open: open.length,
      won: base.leads.filter((lead) => lead.stage === "CIERRE/ GANADO").length,
      lost: base.leads.filter((lead) => lead.stage === "OPORTUNIDAD PERDIDA").length,
      recurrent: base.leads.filter((lead) => lead.stage === "CLIENTE RECURRENTE").length,
      openPipeline: open.reduce((sum, lead) => sum + (lead.expected_revenue ?? 0), 0),
      comodatos: base.equipment.length,
      overdueActivities: activities.filter((activity) => isActivityOverdue({ assignee: activity.assignee, deadline: activity.deadline, state: activity.state }, today)).length,
      latestLeadKey: latest?.import_key ?? null,
    },
    events,
    leads: base.leads,
    equipment: base.equipment,
  };
  return NextResponse.json(payload);
}
