"use client";

import { Clock, Hourglass } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { plural, type PersonSummary } from "@/components/committee/helpers";

/** Panel lateral: avance por responsable y leyenda de colores. */
export function PeopleAside({ people, person, onSelect }: { people: PersonSummary[]; person: string | null; onSelect: (key: string | null) => void }) {
  return (
    <Card className="h-max min-w-0 lg:sticky lg:top-20">
      <CardHeader title="Pendientes por persona" description="Clic en un nombre para ver solo lo suyo." className="px-4" />
      <CardBody className="space-y-1 px-2 py-2">
        {people.length === 0 && <p className="px-2 py-3 text-xs text-ink-3">No hay pendientes con estos filtros.</p>}
        {people.map((item) => {
          const active = person === item.key;
          const ratio = item.total ? Math.round((item.closed / item.total) * 100) : 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : item.key)}
              className={cn("block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent-soft/60", active && "bg-accent-soft")}
            >
              <span className="flex items-center justify-between gap-2 text-sm">
                <span className={cn("truncate", item.unassigned ? "italic text-ink-3" : "font-medium text-ink")}>{item.name}</span>
                <span className="num shrink-0 text-xs text-ink-3">
                  {item.closed}/{item.total}
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-accent-soft" aria-hidden>
                <span className="block h-full rounded-full bg-ok transition-[width]" style={{ width: `${ratio}%` }} />
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
                <span className="num">{plural(item.open, "abierto", "abiertos")}</span>
                {item.overdue > 0 && (
                  <span className="num inline-flex items-center gap-1 text-danger">
                    <Clock className="size-3" aria-hidden /> {plural(item.overdue, "vencido", "vencidos")}
                  </span>
                )}
                {item.carried > 0 && (
                  <span className="num inline-flex items-center gap-1 text-danger">
                    <Hourglass className="size-3" aria-hidden /> {plural(item.carried, "arrastrado", "arrastrados")}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </CardBody>
      <CardBody className="border-t border-line-2 px-4 py-3">
        <p className="eyebrow mb-1.5">Leyenda</p>
        <ul className="space-y-1.5 text-xs text-ink-2">
          <li className="flex items-start gap-2">
            <span className="mt-1 size-2.5 shrink-0 rounded-sm bg-warn" aria-hidden />
            <span><strong className="font-medium text-ink">1 comité</strong> sin cerrar (ámbar): nació en el comité anterior</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-2.5 shrink-0 rounded-sm bg-danger" aria-hidden />
            <span><strong className="font-medium text-ink">Arrastrado</strong> (rojo): lleva 2 o más comités sin cerrarse</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-2.5 shrink-0 rounded-sm border-2 border-danger" aria-hidden />
            <span><strong className="font-medium text-ink">Vencido</strong>: sigue abierto y su fecha límite ya pasó</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-2.5 shrink-0 rounded-sm bg-ok" aria-hidden />
            <span><strong className="font-medium text-ink">Cerrado</strong>: resuelto; se mantiene en el acta de este comité</span>
          </li>
        </ul>
      </CardBody>
    </Card>
  );
}
