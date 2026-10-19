"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { List, SquareKanban, X } from "lucide-react";
import type { LeadRecord } from "@/lib/db";
import { cn, cop, displaySeller } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageHeader, Toolbar } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stat, StatGrid } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { Kanban } from "@/components/pipeline/Kanban";
import { LeadSheet } from "@/components/pipeline/LeadSheet";
import { LeadTable } from "@/components/pipeline/LeadTable";
import { type Bucket, GROUP_META, isOverdue, stageGroup, stageShort, sumRevenue, weightedRevenue, compactCop } from "@/components/pipeline/stage-meta";

type View = "board" | "list";
const VIEW_STORAGE = "crm.pipeline.view";

/**
 * Pantalla del pipeline: resumen clicable, filtros, tablero o lista y panel de detalle.
 * La oportunidad abierta vive en la URL (`?lead=`) para que ⌘K, Inicio y Clientes puedan enlazarla.
 */
export function PipelineBoard({ initial, today }: { initial: LeadRecord[]; today: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const selectedKey = searchParams.get("lead");
  const urlQuery = searchParams.get("q") ?? "";

  const [leads, setLeads] = React.useState(initial);
  const [view, setView] = React.useState<View>("board");
  const [q, setQ] = React.useState(urlQuery);
  const [seller, setSeller] = React.useState("");
  const [team, setTeam] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(false);
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [bucket, setBucket] = React.useState<Bucket>("all");
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => setQ(urlQuery), [urlQuery]);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE);
      if (stored === "board" || stored === "list") setView(stored);
    } catch {
      /* sin almacenamiento local */
    }
  }, []);

  function changeView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE, next);
    } catch {
      /* sin almacenamiento local */
    }
  }

  const sellers = React.useMemo(
    () => [...new Set(initial.map((lead) => lead.salesperson).filter(Boolean))].sort((a, b) => displaySeller(a).localeCompare(displaySeller(b), "es")),
    [initial],
  );
  const teams = React.useMemo(() => [...new Set(initial.map((lead) => lead.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [initial]);

  // Filtros base: búsqueda, vendedor, equipo y activas. Los indicadores se calculan sobre este conjunto.
  const base = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((lead) => {
      if (activeOnly && !lead.active) return false;
      if (seller && lead.salesperson !== seller) return false;
      if (team && lead.team !== team) return false;
      if (needle && !`${lead.name} ${lead.customer} ${lead.salesperson} ${displaySeller(lead.salesperson)}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [leads, q, seller, team, activeOnly]);

  const stats = React.useMemo(() => {
    const open = base.filter((lead) => stageGroup(lead.stage) === "open");
    return {
      open: open.length,
      openRevenue: sumRevenue(open),
      weighted: open.reduce((sum, lead) => sum + weightedRevenue(lead), 0),
      overdue: open.filter((lead) => isOverdue(lead, today)).length,
      won: base.filter((lead) => stageGroup(lead.stage) === "won").length,
      lost: base.filter((lead) => stageGroup(lead.stage) === "lost").length,
    };
  }, [base, today]);

  const boardLeads = React.useMemo(() => (overdueOnly ? base.filter((lead) => isOverdue(lead, today)) : base), [base, overdueOnly, today]);
  const visible = React.useMemo(() => (bucket === "all" ? boardLeads : boardLeads.filter((lead) => stageGroup(lead.stage) === bucket)), [boardLeads, bucket]);

  const selected = React.useMemo(() => (selectedKey ? leads.find((lead) => lead.import_key === selectedKey) ?? null : null), [leads, selectedKey]);

  const setLeadParam = React.useCallback(
    (key: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key) params.set("lead", key);
      else params.delete("lead");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams],
  );

  React.useEffect(() => {
    if (selectedKey && !selected) {
      toast({ title: "No encontramos esa oportunidad", description: "Puede que el export haya cambiado. Búscala con ⌘K.", tone: "warn" });
      setLeadParam(null);
    }
  }, [selectedKey, selected, toast, setLeadParam]);

  async function move(importKey: string, stage: string): Promise<boolean> {
    const current = leads.find((lead) => lead.import_key === importKey);
    if (!current || current.stage === stage) return true;
    const previous = current.stage;
    setLeads((rows) => rows.map((lead) => (lead.import_key === importKey ? { ...lead, stage, edited_locally: 1 } : lead)));
    setSavingKey(importKey);
    try {
      const response = await fetch("/api/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importKey, patch: { stage } }),
      });
      if (!response.ok) throw new Error(String(response.status));
      toast({ title: "Etapa guardada", description: `${current.customer || current.name} → ${stageShort(stage)}` });
      return true;
    } catch {
      setLeads((rows) => rows.map((lead) => (lead.import_key === importKey ? { ...lead, stage: previous } : lead)));
      toast({ title: "No se pudo guardar la etapa", description: "Revisa la conexión e inténtalo de nuevo.", tone: "danger" });
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  function toggleBucket(next: Bucket) {
    setBucket((current) => (current === next ? "all" : next));
  }

  function clearFilters() {
    setQ("");
    setSeller("");
    setTeam("");
    setActiveOnly(false);
    setOverdueOnly(false);
    setBucket("all");
  }

  const hasFilters = !!q || !!seller || !!team || activeOnly || overdueOnly || bucket !== "all";

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Pay Line"
        title="Pipeline"
        description="Oportunidades del export de Odoo por etapa. Los cambios de etapa se guardan aquí, no en Odoo."
        actions={
          <Segmented<View>
            ariaLabel="Vista"
            value={view}
            onChange={changeView}
            options={[
              { value: "board", label: <span className="inline-flex items-center gap-1.5"><SquareKanban className="size-4" aria-hidden />Tablero</span> },
              { value: "list", label: <span className="inline-flex items-center gap-1.5"><List className="size-4" aria-hidden />Lista</span> },
            ]}
          />
        }
      >
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente, oportunidad o vendedor" className="w-full sm:w-80" aria-label="Buscar oportunidades" />
          <Select value={seller} onChange={(event) => setSeller(event.target.value)} aria-label="Vendedor" className="w-full sm:w-52">
            <option value="">Todos los vendedores</option>
            {sellers.map((name) => <option key={name} value={name}>{displaySeller(name)}</option>)}
          </Select>
          <Select value={team} onChange={(event) => setTeam(event.target.value)} aria-label="Equipo" className="w-full sm:w-44">
            <option value="">Todos los equipos</option>
            {teams.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
          <Chip active={activeOnly} onClick={() => setActiveOnly((value) => !value)}>Solo activas</Chip>
          <Chip active={overdueOnly} alert={!overdueOnly && stats.overdue > 0} count={stats.overdue} onClick={() => setOverdueOnly((value) => !value)}>Solo con actividad vencida</Chip>
          {bucket !== "all" && (
            <Chip active onClick={() => setBucket("all")} aria-label={`Quitar filtro ${GROUP_META[bucket].plural}`}>
              Solo {GROUP_META[bucket].plural.toLowerCase()} <X className="size-3" aria-hidden />
            </Chip>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}><X />Limpiar</Button>
          )}
          <span className="num ml-auto text-xs text-ink-3">{visible.length} de {leads.length} oportunidades</span>
        </Toolbar>
      </PageHeader>

      <StatGrid cols={6} className="mb-5">
        <StatButton label="Abiertas" value={stats.open} hint="etapas 1 a 6" active={bucket === "open" && !overdueOnly} onClick={() => toggleBucket("open")} />
        <StatButton label="Ingreso esperado abierto" value={compactCop(stats.openRevenue)} hint={`${cop(stats.openRevenue)} · suma de las abiertas`} active={bucket === "open" && !overdueOnly} onClick={() => toggleBucket("open")} />
        <StatButton label="Pronóstico ponderado" value={compactCop(stats.weighted)} hint={`${cop(stats.weighted)} · ingreso × probabilidad`} tone="info" active={bucket === "open" && !overdueOnly} onClick={() => toggleBucket("open")} />
        <StatButton
          label="Con actividad vencida"
          value={stats.overdue}
          hint="abiertas con actividad atrasada"
          tone={stats.overdue > 0 ? "danger" : "neutral"}
          active={overdueOnly && bucket === "open"}
          onClick={() => {
            const on = overdueOnly && bucket === "open";
            setOverdueOnly(!on);
            setBucket(on ? "all" : "open");
          }}
        />
        <StatButton label="Ganadas" value={stats.won} hint="Cierre / ganado" tone="ok" active={bucket === "won"} onClick={() => toggleBucket("won")} />
        <StatButton label="Perdidas" value={stats.lost} hint="Oportunidad perdida" tone={stats.lost > 0 ? "danger" : "neutral"} active={bucket === "lost"} onClick={() => toggleBucket("lost")} />
      </StatGrid>

      {view === "board" ? (
        <Kanban leads={boardLeads} today={today} focus={bucket} onMove={(key, stage) => void move(key, stage)} onOpen={setLeadParam} />
      ) : (
        <LeadTable leads={visible} today={today} selectedKey={selectedKey} onOpen={setLeadParam} />
      )}

      <LeadSheet lead={selected} open={!!selected} onOpenChange={(open) => !open && setLeadParam(null)} today={today} saving={savingKey === selected?.import_key} onMove={move} />
    </div>
  );
}

/** Stat clicable: aplica un filtro a la lista de abajo y se marca cuando está activo. */
function StatButton({
  active,
  onClick,
  ...stat
}: React.ComponentProps<typeof Stat> & { active: boolean; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40 [&>div]:transition-colors [&>div]:hover:border-line [&>div]:hover:bg-surface-2",
        active && "[&>div]:border-navy [&>div]:bg-accent-soft [&>div]:hover:bg-accent-soft",
      )}
    >
      <Stat {...stat} />
    </div>
  );
}
