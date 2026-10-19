"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, CircleCheck, Clock, Mail, MessageCircle, Phone, Users } from "lucide-react";
import type { LeadRecord } from "@/lib/db";
import { STAGES } from "@/lib/odoo/stages";
import type { ActivityRecord } from "@/lib/pipeline/queries";
import { cn, cop, displaySeller, shortDate, stripHtml } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldSection } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { fullDate, GROUP_META, isOverdue, stageGroup, stageShort } from "@/components/pipeline/stage-meta";

/**
 * Panel lateral de una oportunidad: cambia la etapa sin arrastrar (funciona en el celular),
 * muestra todos los datos del export y las actividades vinculadas.
 */
export function LeadSheet({
  lead,
  open,
  onOpenChange,
  today,
  saving,
  onMove,
}: {
  lead: LeadRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  saving: boolean;
  onMove: (importKey: string, stage: string) => Promise<boolean>;
}) {
  const key = lead?.import_key ?? null;
  const [activities, setActivities] = React.useState<ActivityRecord[] | null>(null);

  React.useEffect(() => {
    if (!open || !key) return;
    let cancelled = false;
    setActivities(null);
    fetch(`/api/leads?key=${encodeURIComponent(key)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ activities: ActivityRecord[] }>) : null))
      .then((payload) => {
        if (!cancelled) setActivities(payload?.activities ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, key]);

  if (!lead) return null;
  const group = stageGroup(lead.stage);
  const overdue = isOverdue(lead, today);
  const probability = lead.probability == null ? null : Math.max(0, Math.min(100, Math.round(lead.probability)));
  const tags = lead.tags ? lead.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="md"
        eyebrow="Oportunidad"
        title={lead.customer || lead.name}
        description={lead.customer ? lead.name : `${displaySeller(lead.salesperson)} · ${lead.team || "Sin equipo"}`}
        actions={<Badge tone={GROUP_META[group].badge}>{stageShort(lead.stage)}</Badge>}
      >
        <SheetBody className="space-y-6">
          <Field label="Etapa" htmlFor="lead-stage" hint="Se guarda en este CRM, no en Odoo. Arrastrar la tarjeta en el tablero hace lo mismo.">
            <Select id="lead-stage" value={lead.stage} disabled={saving} onChange={(event) => void onMove(lead.import_key, event.target.value)}>
              <optgroup label="En curso">
                {STAGES.filter((stage) => stageGroup(stage.name) === "open").map((stage) => (
                  <option key={stage.name} value={stage.name}>{stage.position}. {stage.short}</option>
                ))}
              </optgroup>
              <optgroup label="Cerradas">
                {STAGES.filter((stage) => stageGroup(stage.name) !== "open").map((stage) => (
                  <option key={stage.name} value={stage.name}>{stage.position}. {stage.short}</option>
                ))}
              </optgroup>
            </Select>
          </Field>

          <FieldSection title="Datos de la oportunidad">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <Item label="Vendedor" value={displaySeller(lead.salesperson)} />
              <Item label="Equipo" value={lead.team || "—"} />
              <Item label="Ingreso esperado" value={<span className="num">{lead.expected_revenue ? cop(lead.expected_revenue) : "—"}</span>} />
              <Item
                label="Probabilidad"
                value={
                  probability == null ? "—" : (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-accent-soft"><span className="block h-full rounded-full bg-navy-2" style={{ width: `${probability}%` }} /></span>
                      <span className="num">{probability}%</span>
                    </span>
                  )
                }
              />
              <Item label="Creada el" value={fullDate(lead.created_at)} />
              <Item label="Cierre previsto" value={lead.expected_close ? fullDate(lead.expected_close) : "—"} />
              {lead.closed_at && <Item label="Cerrada el" value={fullDate(lead.closed_at)} />}
              <Item
                label="Próxima actividad"
                value={
                  lead.next_activity_deadline ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {overdue ? <Badge tone="danger" size="sm" dot>Vencida · {shortDate(lead.next_activity_deadline)}</Badge> : <Badge tone="info" size="sm">{shortDate(lead.next_activity_deadline)}</Badge>}
                      <span>{[lead.next_activity_type, lead.next_activity_summary].filter(Boolean).join(" · ") || null}</span>
                    </span>
                  ) : (
                    "Sin actividad programada"
                  )
                }
              />
              <Item label="Estado" value={lead.active ? <Badge tone="ok" size="sm" dot>Activa</Badge> : <Badge tone="outline" size="sm">Inactiva</Badge>} />
              <Item
                label="Resultado en Odoo"
                value={<Badge size="sm" tone={lead.won_status === "Ganado" ? "ok" : lead.won_status === "Perdido" ? "danger" : "neutral"}>{lead.won_status || "Pendiente"}</Badge>}
              />
              {lead.loss_reason && <Item label="Motivo de pérdida" value={lead.loss_reason} />}
              {tags.length > 0 && (
                <Item
                  label="Etiquetas"
                  value={
                    <span className="flex flex-wrap gap-1">
                      {tags.map((tag) => <Badge key={tag} tone="outline" size="sm">{tag}</Badge>)}
                    </span>
                  }
                />
              )}
              {!!lead.edited_locally && <Item label="Origen del dato" value={<Badge tone="warn" size="sm">Cambiada aquí · distinta de Odoo</Badge>} />}
            </dl>
          </FieldSection>

          <FieldSection title={activities ? `Actividades (${activities.length})` : "Actividades"} description="Las que trae el export de Odoo para esta oportunidad.">
            {activities === null ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : activities.length === 0 ? (
              <EmptyState compact icon={<Clock />} title="Sin actividades vinculadas" description="El export no trae actividades para esta oportunidad o no se pudieron enlazar por nombre." />
            ) : (
              <ul className="space-y-2">
                {activities.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} today={today} />
                ))}
              </ul>
            )}
          </FieldSection>
        </SheetBody>
        <SheetFooter>
          {lead.customer ? (
            <Button variant="secondary" asChild>
              <Link href={`/clientes?cliente=${encodeURIComponent(lead.customer)}`}><Users />Ver cliente</Link>
            </Button>
          ) : (
            <Button variant="secondary" disabled title="Esta oportunidad no tiene cliente en el export"><Users />Ver cliente</Button>
          )}
          <Button asChild>
            <Link href={`/correos?lead=${encodeURIComponent(lead.import_key)}`}><Mail />Redactar correo</Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

function activityIcon(type: string) {
  const lower = type.toLowerCase();
  if (/call|llamada/.test(lower)) return Phone;
  if (/mail|correo/.test(lower)) return Mail;
  if (/whatsapp|message|mensaje/.test(lower)) return MessageCircle;
  if (/meeting|reuni/.test(lower)) return CalendarDays;
  if (/hacer|todo/.test(lower)) return CircleCheck;
  return Clock;
}

function ActivityItem({ activity, today }: { activity: ActivityRecord; today: string }) {
  const Icon = activityIcon(activity.activity_type);
  const overdue = activity.state.toLowerCase() === "vencidas" || (!!activity.deadline && activity.deadline < today);
  const note = stripHtml(activity.note) || activity.summary;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-line-2 bg-surface-2/60 px-3 py-2.5">
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5", overdue ? "bg-danger-soft text-danger" : "bg-accent-soft text-ink-2")}>
        <Icon aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-ink">{activity.activity_type || "Actividad"}</p>
          {overdue ? <Badge tone="danger" size="sm" dot>Vencida</Badge> : <Badge tone="neutral" size="sm">{activity.state || "Pendiente"}</Badge>}
        </div>
        <p className="text-xs text-ink-2">
          <span className="num">{activity.deadline ? fullDate(activity.deadline) : "Sin fecha"}</span> · {displaySeller(activity.assignee)}
        </p>
        {note && <p className="mt-1 text-xs text-ink-2">{note}</p>}
      </div>
    </li>
  );
}
