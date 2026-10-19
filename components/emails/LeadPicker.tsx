"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, FileText, LoaderCircle } from "lucide-react";
import { cn, cop, displaySeller } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { stageLabel, type LeadSummary } from "@/components/emails/fields";

export type LeadMode = "search" | "chosen" | "generic";

/**
 * Paso 2: buscar una oportunidad (GET /api/leads?q=) con debounce de 150 ms y cancelación de peticiones viejas,
 * o seguir sin oportunidad con texto genérico. Al elegir, muestra la tarjeta de la oportunidad con botón "Cambiar".
 */
export function LeadPicker({
  mode,
  lead,
  onChoose,
  onGeneric,
  onChange,
  onKeep,
}: {
  mode: LeadMode;
  lead: LeadSummary | null;
  onChoose: (lead: LeadSummary) => void;
  onGeneric: () => void;
  onChange: () => void;
  onKeep: () => void;
}) {
  if (mode === "chosen" && lead) return <ChosenLead lead={lead} onChange={onChange} />;
  if (mode === "generic") return <GenericLead onChange={onChange} />;
  return <LeadSearch onChoose={onChoose} onGeneric={onGeneric} current={lead} onKeep={onKeep} />;
}

function LeadSearch({ onChoose, onGeneric, current, onKeep }: { onChoose: (lead: LeadSummary) => void; onGeneric: () => void; current: LeadSummary | null; onKeep: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const term = query.trim();

  useEffect(() => {
    if (!term) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/leads?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { leads?: LeadSummary[] };
        setResults(payload.leads ?? []);
        setActiveIndex(-1);
        setOpen(true);
        setLoading(false);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setResults([]);
        setFailed(true);
        setOpen(true);
        setLoading(false);
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(item: LeadSummary) {
    setOpen(false);
    setQuery("");
    onChoose(item);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  const listId = "lead-search-results";
  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Cliente, oportunidad o vendedor"
          aria-label="Buscar oportunidad"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          role="combobox"
          onFocus={() => term && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && <LoaderCircle className="pointer-events-none absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-3" aria-hidden />}
        {open && term && (
          <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-line-2 bg-surface p-1 shadow-pop">
            {failed ? (
              <p className="px-3 py-2 text-xs text-danger">No se pudo buscar. Revisa que el servidor esté corriendo e inténtalo de nuevo.</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-3">{loading ? "Buscando…" : `Sin resultados para «${term}». Prueba con parte del nombre del cliente.`}</p>
            ) : (
              results.map((item, index) => (
                <button
                  key={item.import_key}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                  className={cn("flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors", index === activeIndex ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <span className="w-full truncate text-sm font-medium text-ink">{item.customer || item.name}</span>
                  <span className="w-full truncate text-xs text-ink-3">
                    {item.name}
                    {item.stage && <> · {stageLabel(item.stage)}</>}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span>o</span>
        <Button variant="secondary" size="sm" onClick={onGeneric}>
          <FileText /> Sin oportunidad (texto genérico)
        </Button>
      </div>
      {current && (
        <p className="text-xs text-ink-3">
          El borrador sigue usando <span className="font-medium text-ink-2">{current.customer || current.name}</span> hasta que elijas otra.{" "}
          <Button variant="link" size="sm" onClick={onKeep} className="h-auto text-xs">Mantener</Button>
        </p>
      )}
    </div>
  );
}

function ChosenLead({ lead, onChange }: { lead: LeadSummary; onChange: () => void }) {
  return (
    <div className="rounded-lg border border-line-2 bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Oportunidad elegida</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink">{lead.customer || "Sin cliente"}</p>
          <p className="truncate text-xs text-ink-2">{lead.name}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onChange} className="shrink-0">Cambiar</Button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-3">Vendedor</dt>
        <dd className="truncate text-ink">{lead.salesperson ? displaySeller(lead.salesperson) : <span className="text-ink-3">sin vendedor</span>}</dd>
        <dt className="text-ink-3">Etapa</dt>
        <dd><Badge tone="info" size="sm">{stageLabel(lead.stage)}</Badge></dd>
        <dt className="text-ink-3">Ingreso</dt>
        <dd className="num text-ink">{lead.expected_revenue ? cop(lead.expected_revenue) : <span className="text-ink-3">sin ingreso esperado</span>}</dd>
      </dl>
      <Link href={`/pipeline?lead=${encodeURIComponent(lead.import_key)}`} className="mt-3 inline-flex items-center gap-1 text-xs text-navy-2 underline-offset-4 hover:underline">
        Ver en el pipeline <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function GenericLead({ onChange }: { onChange: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3.5">
      <div className="min-w-0">
        <p className="eyebrow">Sin oportunidad</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">Texto genérico</p>
        <p className="text-xs text-ink-2">Cliente, oportunidad e ingreso quedan como texto genérico; cámbialos en el borrador antes de enviar.</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onChange} className="shrink-0">Cambiar</Button>
    </div>
  );
}
