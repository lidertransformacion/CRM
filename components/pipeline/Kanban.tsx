"use client";

import * as React from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { LeadRecord } from "@/lib/db";
import { STAGES, type StageDef } from "@/lib/odoo/stages";
import { cn, cop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { LeadCard } from "@/components/pipeline/LeadCard";
import { useIsMobile } from "@/components/pipeline/use-media";
import { type Bucket, CLOSED_STAGE_DEFS, compactCop, GROUP_META, OPEN_STAGE_DEFS, stageGroup, sumRevenue } from "@/components/pipeline/stage-meta";

/** Tiempo máximo que se ignoran los eventos de scroll tras un salto con el selector (evita que parpadee). */
const JUMP_SETTLE_MS = 900;

/**
 * Tablero por etapas. En escritorio las seis etapas abiertas van anchas; Ganado, Recurrente y Perdida
 * van colapsadas (solo conteo e ingreso) y las tarjetas se arrastran entre columnas.
 * En el celular hay una columna por pantalla (desplazamiento horizontal con snap), un selector de etapa
 * pegajoso para saltar entre columnas y ninguna columna colapsada; la etapa se cambia desde el panel.
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
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const selectorRef = React.useRef<HTMLDivElement>(null);
  const jumpRef = React.useRef<{ index: number; until: number } | null>(null);

  const byStage = React.useMemo(() => {
    const map = new Map<string, LeadRecord[]>();
    for (const lead of leads) {
      const list = map.get(lead.stage) ?? [];
      list.push(lead);
      map.set(lead.stage, list);
    }
    return map;
  }, [leads]);

  const extraStages = React.useMemo(() => {
    const known = new Set(STAGES.map((stage) => stage.name));
    return [...byStage.keys()]
      .filter((name) => !known.has(name))
      .sort((a, b) => a.localeCompare(b, "es"))
      .map(
        (name): StageDef => ({
          name,
          position: STAGES.length + 1,
          isWon: false,
          isLost: false,
          teamRestriction: "all",
          short: name,
        }),
      );
  }, [byStage]);

  // Columnas del celular: las abiertas (y las que Odoo envió sin mapa) y, salvo con el foco en "Abiertas", también las cerradas.
  const mobileStages = React.useMemo(
    () => (focus === "open" ? [...OPEN_STAGE_DEFS, ...extraStages] : [...OPEN_STAGE_DEFS, ...extraStages, ...CLOSED_STAGE_DEFS]),
    [focus, extraStages],
  );
  const current = Math.min(activeIndex, mobileStages.length - 1);

  // En el celular, seguir la columna visible para marcar el selector y el indicador "n/9".
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!isMobile || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const columns = Array.from(scroller.children) as HTMLElement[];
      if (!columns.length) return;
      const origin = columns[0].offsetLeft;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      columns.forEach((column, index) => {
        const distance = Math.abs(column.offsetLeft - origin - scroller.scrollLeft);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      const jump = jumpRef.current;
      if (jump) {
        if (best === jump.index || Date.now() > jump.until) jumpRef.current = null;
        else return;
      }
      setActiveIndex(best);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isMobile, mobileStages]);

  // Mantener centrada la pestaña activa del selector de etapa.
  React.useEffect(() => {
    const list = selectorRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const listRect = list.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const target = list.scrollLeft + (tabRect.left - listRect.left) - (listRect.width - tabRect.width) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [current]);

  function jumpTo(index: number) {
    const scroller = scrollerRef.current;
    const columns = scroller ? (Array.from(scroller.children) as HTMLElement[]) : [];
    const column = columns[index];
    if (!scroller || !column) return;
    jumpRef.current = { index, until: Date.now() + JUMP_SETTLE_MS };
    setActiveIndex(index);
    scroller.scrollTo({ left: column.offsetLeft - columns[0].offsetLeft, behavior: "smooth" });
  }

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

  // En pantallas táctiles no hay arrastre: la tarjeta solo abre el panel.
  const cardProps = {
    today,
    onOpen,
    onDragStart: isMobile ? undefined : (key: string) => setDragging(key),
    onDragEnd: isMobile
      ? undefined
      : () => {
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
      {/* Celular: selector de etapa pegajoso bajo la cabecera de la app, con conteos e indicador de posición. */}
      <div ref={selectorRef} className="sticky top-14 z-10 -mx-4 mb-2 flex items-center gap-2 bg-bg/95 px-4 py-2 backdrop-blur sm:hidden">
        <Segmented<string>
          ariaLabel="Ir a la etapa"
          className="min-w-0 flex-1"
          value={mobileStages[current].name}
          onChange={(name) => jumpTo(mobileStages.findIndex((stage) => stage.name === name))}
          options={mobileStages.map((stage) => ({ value: stage.name, label: stage.short, count: (byStage.get(stage.name) ?? []).length }))}
        />
        <span className="num shrink-0 text-xs text-ink-3" aria-live="polite">
          {current + 1}/{mobileStages.length}
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="relative flex items-start gap-3 overflow-x-auto pb-3 max-sm:-mx-4 max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-pl-4 max-sm:px-4"
      >
        {[...OPEN_STAGE_DEFS, ...extraStages].map((stage) => {
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
          if (isMobile) {
            // En el celular no hay columnas colapsadas: con el foco en abiertas se omiten; si no, van completas.
            if (focus === "open") return null;
            return (
              <Column key={stage.name} stage={stage} count={cards.length} revenue={revenue} over={false} dragging={false} {...dropProps(stage.name)}>
                {cards.map((lead) => (
                  <LeadCard key={lead.import_key} lead={lead} {...cardProps} />
                ))}
              </Column>
            );
          }
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
      <p className="mt-1 text-xs text-ink-3 lg:hidden">Toca una tarjeta para abrirla y cambiar su etapa desde el panel.</p>
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
        // Celular: una columna por pantalla, con snap y la altura que deja libre la cabecera + el selector + la barra inferior.
        "max-sm:w-[calc(100vw-2rem)] max-sm:snap-start max-sm:max-h-[calc(100dvh-11.5rem-env(safe-area-inset-bottom))]",
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
