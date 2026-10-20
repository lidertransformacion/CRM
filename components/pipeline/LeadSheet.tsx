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
import { LinkedContracts } from "@/components/legal/LinkedContracts";

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
  canUploadContract = false,
}: {
  lead: LeadRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  saving: boolean;
  onMove: (importKey: string, stage: string) => Promise<boolean>;
  canUploadContract?: boolean;
}) {
  const key = lead?.import_key ?? null;
  const [activities, setActivities] = React.useState<ActivityRecord[] | null>(null);
  const [detail, setDetail] = React.useState<LeadRecord | null>(null);

  React.useEffect(() => {
    if (!open || !key) return;
    let cancelled = false;
    setActivities(null);
    setDetail(null);
    fetch(`/api/leads?key=${encodeURIComponent(key)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ lead?: LeadRecord; activities: ActivityRecord[] }>) : null))
      .then((payload) => {
        if (cancelled) return;
        setActivities(payload?.activities ?? []);
        if (payload?.lead) setDetail(payload.lead);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, key]);

  if (!lead) return null;
  const shown = detail ?? lead;
  const group = stageGroup(shown.stage);
  const overdue = isOverdue(shown, today);
  const probability = shown.probability == null ? null : Math.max(0, Math.min(100, Math.round(shown.probability)));
  const tags = shown.tags ? shown.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="md"
        eyebrow="Oportunidad"
        title={shown.customer || shown.name}
        description={shown.customer ? shown.name : `${displaySeller(shown.salesperson)} · ${shown.team || "Sin equipo"}`}
        actions={<Badge tone={GROUP_META[group].badge}>{stageShort(shown.stage)}</Badge>}
      >
        <SheetBody className="space-y-6">
          <Field
            label="Etapa"
            htmlFor="lead-stage"
            hint={
              <>
                Se guarda en este CRM, no en Odoo.<span className="max-sm:hidden"> Arrastrar la tarjeta en el tablero hace lo mismo.</span>
              </>
            }
          >
            <Select id="lead-stage" value={shown.stage} disabled={saving} onChange={(event) => void onMove(shown.import_key, event.target.value)}>
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
            {/* Dos columnas también en el celular: los datos cortos caben y los largos ocupan toda la fila. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Item label="Vendedor" value={displaySeller(shown.salesperson)} />
              <Item label="Equipo" value={shown.team || "—"} />
              <Item label="Ingreso esperado" value={<span className="num">{shown.expected_revenue ? cop(shown.expected_revenue) : "—"}</span>} />
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
              <Item label="Creada el" value={fullDate(shown.created_at)} />
              <Item label="Cierre previsto" value={shown.expected_close ? fullDate(shown.expected_close) : "—"} />
              {shown.closed_at && <Item label="Cerrada el" value={fullDate(shown.closed_at)} />}
              <Item
                label="Próxima actividad"
                wide
                value={
                  shown.next_activity_deadline ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {overdue ? <Badge tone="danger" size="sm" dot>Vencida · {shortDate(shown.next_activity_deadline)}</Badge> : <Badge tone="info" size="sm">{shortDate(shown.next_activity_deadline)}</Badge>}
                      <span>{[shown.next_activity_type, shown.next_activity_summary].filter(Boolean).join(" · ") || null}</span>
                    </span>
                  ) : (
                    "Sin actividad programada"
                  )
                }
              />
              <Item label="Estado" value={shown.active ? <Badge tone="ok" size="sm" dot>Activa</Badge> : <Badge tone="outline" size="sm">Inactiva</Badge>} />
              <Item
                label="Resultado en Odoo"
                value={<Badge size="sm" tone={shown.won_status === "Ganado" ? "ok" : shown.won_status === "Perdido" ? "danger" : "neutral"}>{shown.won_status || "Pendiente"}</Badge>}
              />
              {shown.loss_reason && <Item label="Motivo de pérdida" wide value={shown.loss_reason} />}
              {tags.length > 0 && (
                <Item
                  label="Etiquetas"
                  wide
                  value={
                    <span className="flex flex-wrap gap-1">
                      {tags.map((tag) => <Badge key={tag} tone="outline" size="sm">{tag}</Badge>)}
                    </span>
                  }
                />
              )}
              {!!shown.edited_locally && <Item label="Origen del dato" wide value={<Badge tone="warn" size="sm">Cambiada aquí · distinta de Odoo</Badge>} />}
            </dl>
          </FieldSection>

          <LinkedContracts targetType="lead" targetKey={shown.import_key} canUpload={canUploadContract} />

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
          {/* Los enlaces (asChild) no son <button>, así que el reparto del ancho en móvil va explícito. */}
          {shown.customer ? (
            <Button variant="secondary" asChild className="max-sm:flex-1">
              <Link href={`/clientes?cliente=${encodeURIComponent(shown.customer)}`}><Users />Ver cliente</Link>
            </Button>
          ) : (
            <Button variant="secondary" disabled title="Esta oportunidad no tiene cliente en el export"><Users />Ver cliente</Button>
          )}
          <Button asChild className="max-sm:flex-1">
            <Link href={`/correos?lead=${encodeURIComponent(shown.import_key)}`}><Mail />Redactar correo</Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Dato de la ficha. `wide` lo extiende a las dos columnas en el celular (texto largo, listas de etiquetas). */
function Item({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "max-sm:col-span-2")}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{value}</dd>
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
