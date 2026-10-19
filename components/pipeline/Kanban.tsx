"use client";

import * as React from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { LeadRecord } from "@/lib/db";
import type { StageDef } from "@/lib/odoo/stages";
import { cn, cop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { LeadCard } from "@/components/pipeline/LeadCard";
import { type Bucket, CLOSED_STAGE_DEFS, compactCop, GROUP_META, OPEN_STAGE_DEFS, stageGroup, sumRevenue } from "@/components/pipeline/stage-meta";

/**
 * Tablero por etapas. Las seis etapas abiertas van anchas; Ganado, Recurrente y Perdida
 * van colapsadas (solo conteo e ingreso) para que el foco esté en lo que sigue en curso.
 * Arrastrar una tarjeta a otra columna guarda el cambio; hacer clic la abre.
 */
export function Kanban({
  leads,
  today,
  focus,
  onMove,
  onOpen,
}: {
  leads: LeadRecord[];
  today: string;
  focus: Bucket;
  onMove: (importKey: string, stage: string) => void;
  onOpen: (importKey: string) => void;
}) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);

  const byStage = React.useMemo(() => {
    const map = new Map<string, LeadRecord[]>();
    for (const lead of leads) {
      const list = map.get(lead.stage) ?? [];
      list.push(lead);
      map.set(lead.stage, list);
    }
    return map;
  }, [leads]);

  function drop(event: React.DragEvent, stage: string) {
    event.preventDefault();
    const key = event.dataTransfer.getData("text/plain") || dragging;
    setOver(null);
    setDragging(null);
    if (key) onMove(key, stage);
  }

  const dropProps = (stage: string) => ({
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (over !== stage) setOver(stage);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === stage ? null : current));
    },
    onDrop: (event: React.DragEvent) => drop(event, stage),
  });

  const cardProps = {
    today,
    onOpen,
    onDragStart: (key: string) => setDragging(key),
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  };

  // Con el foco en Ganadas/Perdidas/Recurrentes solo se muestra esa columna, ancha y en rejilla.
  if (focus !== "all" && focus !== "open") {
    const stage = CLOSED_STAGE_DEFS.find((def) => stageGroup(def.name) === focus);
    if (!stage) return null;
    const cards = byStage.get(stage.name) ?? [];
    const meta = GROUP_META[focus];
    return (
      <section className={cn("rounded-xl border border-line-2 border-t-[3px] bg-surface-2/70", meta.line)} {...dropProps(stage.name)}>
        <ColumnHeader stage={stage} count={cards.length} revenue={sumRevenue(cards)} />
        <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((lead) => (
            <LeadCard key={lead.import_key} lead={lead} dragging={dragging === lead.import_key} {...cardProps} />
          ))}
          {cards.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ink-3">Sin oportunidades con esos filtros.</p>}
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {OPEN_STAGE_DEFS.map((stage) => {
          const cards = byStage.get(stage.name) ?? [];
          return (
            <Column key={stage.name} stage={stage} count={cards.length} revenue={sumRevenue(cards)} over={over === stage.name} dragging={!!dragging} {...dropProps(stage.name)}>
              {cards.map((lead) => (
                <LeadCard key={lead.import_key} lead={lead} dragging={dragging === lead.import_key} {...cardProps} />
              ))}
            </Column>
          );
        })}
        {CLOSED_STAGE_DEFS.map((stage) => {
          const cards = byStage.get(stage.name) ?? [];
          const revenue = sumRevenue(cards);
          const isExpanded = focus === "all" && !!expanded[stage.name];
          if (!isExpanded) {
            return (
              <CollapsedColumn
                key={stage.name}
                stage={stage}
                count={cards.length}
                revenue={revenue}
                over={over === stage.name}
                dragging={!!dragging}
                canExpand={focus === "all"}
                onExpand={() => setExpanded((current) => ({ ...current, [stage.name]: true }))}
                {...dropProps(stage.name)}
              />
            );
          }
          return (
            <Column
              key={stage.name}
              stage={stage}
              count={cards.length}
              revenue={revenue}
              over={over === stage.name}
              dragging={!!dragging}
              onCollapse={() => setExpanded((current) => ({ ...current, [stage.name]: false }))}
              {...dropProps(stage.name)}
            >
              {cards.map((lead) => (
                <LeadCard key={lead.import_key} lead={lead} dragging={dragging === lead.import_key} {...cardProps} />
              ))}
            </Column>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-ink-3 lg:hidden">En el celular no se puede arrastrar: abre la tarjeta y cambia la etapa desde el panel.</p>
    </div>
  );
}

type DropHandlers = {
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
};

function ColumnHeader({ stage, count, revenue, onCollapse }: { stage: StageDef; count: number; revenue: number; onCollapse?: () => void }) {
  return (
    <header className="flex items-start justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="truncate" title={stage.name}>{stage.short}</span>
          <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-line-2 bg-surface px-1.5 text-[11px] font-medium text-ink-2">{count}</span>
        </p>
        <p className="num text-xs text-ink-3">{revenue ? cop(revenue) : "Sin ingreso esperado"}</p>
      </div>
      {onCollapse && (
        <Tooltip content="Colapsar columna">
          <Button variant="ghost" size="icon-sm" aria-label={`Colapsar ${stage.short}`} onClick={onCollapse}>
            <ChevronsLeft />
          </Button>
        </Tooltip>
      )}
    </header>
  );
}

function Column({
  stage,
  count,
  revenue,
  over,
  dragging,
  onCollapse,
  children,
  ...handlers
}: DropHandlers & { stage: StageDef; count: number; revenue: number; over: boolean; dragging: boolean; onCollapse?: () => void; children: React.ReactNode }) {
  const meta = GROUP_META[stageGroup(stage.name)];
  return (
    <section
      aria-label={`${stage.short}: ${count} oportunidades`}
      className={cn(
        "flex max-h-[72vh] w-[280px] shrink-0 flex-col rounded-xl border border-line-2 border-t-[3px] bg-surface-2/70 transition-[box-shadow,background-color]",
        meta.line,
        over && "bg-accent-soft ring-2 ring-navy-2/50",
      )}
      {...handlers}
    >
      <ColumnHeader stage={stage} count={count} revenue={revenue} onCollapse={onCollapse} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {children}
        {count === 0 && (
          <div className={cn("rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-ink-3", dragging && "border-navy-2 text-ink")}>
            {dragging ? "Suelta aquí" : "Sin oportunidades"}
          </div>
        )}
        {count > 0 && dragging && <div className={cn("rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-ink-3", over && "border-navy-2 bg-surface text-ink")}>Suelta aquí</div>}
      </div>
    </section>
  );
}

function CollapsedColumn({
  stage,
  count,
  revenue,
  over,
  dragging,
  canExpand,
  onExpand,
  ...handlers
}: DropHandlers & { stage: StageDef; count: number; revenue: number; over: boolean; dragging: boolean; canExpand: boolean; onExpand: () => void }) {
  const group = stageGroup(stage.name);
  const meta = GROUP_META[group];
  return (
    <section
      aria-label={`${stage.short}: ${count} oportunidades, columna colapsada`}
      className={cn(
        "flex min-h-[260px] w-16 shrink-0 flex-col items-center gap-1 rounded-xl border border-line-2 border-t-[3px] bg-surface-2/70 py-1.5 transition-[box-shadow,background-color,border-color]",
        meta.line,
        dragging && "border-dashed border-line",
        over && cn("ring-2 ring-navy-2/50", meta.soft),
      )}
      {...handlers}
    >
      {canExpand ? (
        <Tooltip content={`Ver ${meta.plural.toLowerCase()}`}>
          <Button variant="ghost" size="icon-sm" aria-label={`Expandir ${stage.short}`} onClick={onExpand}>
            <ChevronsRight />
          </Button>
        </Tooltip>
      ) : (
        <span className="h-8" />
      )}
      <div className="flex items-center gap-2 py-2 text-xs leading-none text-ink-2 [writing-mode:vertical-rl]">
        <span className={cn("font-semibold", meta.text)}>{stage.short}</span>
        <span className="num">{count} · {revenue ? compactCop(revenue) : "—"}</span>
      </div>
      {dragging && <span className="mt-auto pb-1 text-[10px] text-ink-3">Soltar</span>}
    </section>
  );
}
