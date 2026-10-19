"use client";

import * as React from "react";
import { GripVertical, UserRound } from "lucide-react";
import type { LeadRecord } from "@/lib/db";
import { cn, cop, displaySeller, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { isOverdue } from "@/components/pipeline/stage-meta";

/**
 * Tarjeta del tablero: al hacer clic (o tocar) abre el panel de la oportunidad.
 * Con `onDragStart` además se puede arrastrar entre columnas (solo escritorio).
 */
export function LeadCard({
  lead,
  today,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  lead: LeadRecord;
  today: string;
  dragging?: boolean;
  onOpen: (importKey: string) => void;
  onDragStart?: (importKey: string) => void;
  onDragEnd?: () => void;
}) {
  const title = lead.customer || lead.name;
  const overdue = isOverdue(lead, today);
  const dueToday = !!lead.next_activity_deadline && lead.next_activity_deadline.slice(0, 10) === today;
  const probability = lead.probability == null ? null : Math.max(0, Math.min(100, Math.round(lead.probability)));
  const hasFooter = overdue || !!lead.next_activity_deadline || !lead.active || !!lead.edited_locally;
  const draggable = !!onDragStart;

  return (
    <article
      role="button"
      tabIndex={0}
      draggable={draggable}
      aria-label={`Abrir ${title}`}
      onClick={() => onOpen(lead.import_key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(lead.import_key);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", lead.import_key);
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(lead.import_key);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group/card relative rounded-lg border border-line-2 bg-surface p-3 shadow-card transition-[box-shadow,opacity,border-color] hover:border-line hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40 max-sm:p-3.5 max-sm:active:bg-surface-2",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
      )}
    >
      {draggable && <GripVertical className="absolute right-2 top-3 size-3.5 text-ink-3 opacity-0 transition-opacity group-hover/card:opacity-100" aria-hidden />}
      <p className={cn("text-sm font-semibold leading-snug text-ink max-sm:text-[15px]", draggable && "pr-4")}>{title}</p>
      {lead.customer && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2 max-sm:text-[13px]">{lead.name}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs max-sm:text-[13px]">
        <span className="inline-flex min-w-0 items-center gap-1 text-ink-2">
          <UserRound className="size-3 shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{displaySeller(lead.salesperson)}</span>
        </span>
        {lead.expected_revenue ? <span className="num shrink-0 font-medium text-ink">{cop(lead.expected_revenue)}</span> : <span className="shrink-0 text-ink-3">Sin ingreso</span>}
      </div>
      {probability != null && (
        <div className="mt-2 flex items-center gap-2" aria-label={`Probabilidad ${probability}%`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full rounded-full bg-navy-2" style={{ width: `${probability}%` }} />
          </div>
          <span className="num w-9 text-right text-[11px] text-ink-2">{probability}%</span>
        </div>
      )}
      {hasFooter && (
        <div className="mt-2 flex flex-wrap gap-1">
          {overdue ? (
            <Badge tone="danger" size="sm" dot>Actividad vencida · {shortDate(lead.next_activity_deadline)}</Badge>
          ) : dueToday ? (
            <Badge tone="warn" size="sm" dot>Actividad hoy</Badge>
          ) : lead.next_activity_deadline ? (
            <Badge tone="info" size="sm">Próxima actividad · {shortDate(lead.next_activity_deadline)}</Badge>
          ) : null}
          {!lead.active && <Badge tone="outline" size="sm">Inactiva</Badge>}
          {!!lead.edited_locally && <Badge tone="warn" size="sm">Cambiada aquí</Badge>}
        </div>
      )}
    </article>
  );
}
