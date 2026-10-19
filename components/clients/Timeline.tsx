"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, ClipboardList, Coffee, SquareKanban } from "lucide-react";
import { cn, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { TimelineEvent, TimelineKind } from "@/components/clients/types";

type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info" | "outline";

export const KIND_META: Record<TimelineKind, { label: string; plural: string; icon: React.ComponentType<{ className?: string }>; badge: BadgeTone; dot: string; box: string }> = {
  oportunidad: { label: "Oportunidad", plural: "Oportunidades", icon: SquareKanban, badge: "info", dot: "var(--info)", box: "bg-info-soft text-info" },
  actividad: { label: "Actividad", plural: "Actividades", icon: CalendarClock, badge: "neutral", dot: "var(--navy-2)", box: "bg-accent-soft text-ink-2" },
  comité: { label: "Comité", plural: "Comité", icon: ClipboardList, badge: "warn", dot: "var(--warn)", box: "bg-warn-soft text-hl-ink" },
  comodato: { label: "Comodato", plural: "Comodatos", icon: Coffee, badge: "ok", dot: "var(--ok)", box: "bg-ok-soft text-ok" },
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month || year < 1971) return "Sin fecha";
  return `${MONTHS[month - 1]} ${year}`;
}

/** Línea de tiempo agrupada por mes, con icono y color por tipo de evento. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const key = event.at.slice(0, 7);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, items]) => ({ key, label: monthLabel(key), items }));
  }, [events]);

  if (!events.length) {
    return <EmptyState compact title="Sin eventos" description="No hay nada registrado para este cliente con los filtros elegidos." />;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <p className="eyebrow mb-3">{group.label}</p>
          <ol className="timeline space-y-4">
            {group.items.map((event, index) => (
              <TimelineItem key={`${event.kind}-${event.at}-${index}`} event={event} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const title = event.href ? (
    <Link href={event.href} className="inline-flex items-center gap-1 rounded text-sm font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40">
      {event.title}
      <ArrowUpRight className="size-3.5 text-ink-3" aria-hidden />
    </Link>
  ) : (
    <p className="text-sm font-medium text-ink">{event.title}</p>
  );
  return (
    <li className="relative">
      <span className="timeline-dot" style={{ borderColor: event.alert ? "var(--danger)" : meta.dot }} aria-hidden />
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5", event.alert ? "bg-danger-soft text-danger" : meta.box)}>
          <Icon aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {title}
            <Badge tone={event.alert ? "danger" : meta.badge} size="sm" dot={event.alert}>{event.alert && event.kind === "actividad" ? "Actividad vencida" : meta.label}</Badge>
          </div>
          {event.detail && <p className="mt-0.5 text-xs text-ink-2">{event.detail}</p>}
        </div>
        <span className="num shrink-0 pt-0.5 text-xs text-ink-3">{event.at.startsWith("1970") ? "Sin fecha" : shortDate(event.at)}</span>
      </div>
    </li>
  );
}
