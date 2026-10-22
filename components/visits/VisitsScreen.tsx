"use client";

import { useState } from "react";
import Link from "next/link";
import { CoverageBoard } from "@/components/visits/CoverageBoard";
import { VisitImport } from "@/components/visits/VisitImport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RESULT } from "@/lib/visits/catalog";
import { shortDate, weekData } from "@/lib/visits/calc";
import type { VisitPoint, VisitRecord } from "@/lib/visits/model";

type Segment = "todos" | "adiaz" | "jhiguera" | "none";

/** Week, commercial, and search run on the visits already loaded. */
export function VisitsScreen({
  points,
  visits,
  today,
  initialWeek,
  initialSegment,
  initialList,
  initialQuery,
}: {
  points: VisitPoint[];
  visits: VisitRecord[];
  today: string;
  initialWeek: string;
  initialSegment: Segment;
  initialList: string;
  initialQuery: string;
}) {
  const [week, setWeek] = useState(initialWeek);
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [list, setList] = useState(initialList);
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const data = weekData(visits, points, week, segment, today);
  const needle = query.trim().toLowerCase();
  const history = visits.filter((visit) => {
    if (!needle) return true;
    return [visit.cliente, visit.razonSocial, visit.sede, visit.responsable, visit.tecnico].join(" ").toLowerCase().includes(needle);
  });

  function remember(next: { week?: string; segment?: string; list?: string; query?: string }) {
    const resolved = {
      week: next.week ?? week,
      segment: next.segment ?? segment,
      list: next.list ?? list,
      query: next.query ?? query,
    };
    if (next.week != null) setWeek(next.week);
    if (next.segment != null) setSegment(next.segment as Segment);
    if (next.list != null) setList(next.list);
    if (next.query != null) setQuery(next.query);
    const params = new URLSearchParams();
    if (resolved.week) params.set("week", resolved.week);
    if (resolved.segment !== "todos") params.set("seg", resolved.segment);
    if (resolved.list === "todos") params.set("lista", "todos");
    if (resolved.query) params.set("q", resolved.query);
    const text = params.toString();
    window.history.replaceState(null, "", text ? `/visitas?${text}` : "/visitas");
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Hospitality"
        title="Visitas"
        description="Cobertura de la semana y el historial de reportes de visita."
        actions={
          <Button asChild>
            <Link href="/visitas/nueva">Nueva visita</Link>
          </Button>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            remember({ query: draft });
          }}
        >
          <div className="flex gap-2">
            <Input name="q" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Buscar cliente, sede o responsable" aria-label="Buscar visitas" />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </div>
        </form>
      </PageHeader>
      <CoverageBoard
        data={data}
        segment={segment}
        list={list}
        query={query}
        onNavigate={(next) => remember(next)}
      />
      <section className="mt-8 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Historial</h2>
            <p className="text-sm text-ink-2">{points.length} puntos de venta en la lista. Los registros del celular entran con el código LIBV1.</p>
          </div>
          <VisitImport />
        </div>
        {history.length === 0 ? (
          <p className="rounded-xl border border-line-2 bg-surface px-5 py-8 text-sm text-ink-2">Todavía no hay visitas con ese filtro. La primera se crea con Nueva visita.</p>
        ) : (
          <ul className="divide-y divide-line-2 overflow-hidden rounded-xl border border-line-2 bg-surface">
            {history.map((visit) => {
              const result = visit.resultadoFinal && visit.resultadoFinal in RESULT ? RESULT[visit.resultadoFinal as keyof typeof RESULT] : null;
              return (
                <li key={visit.id}>
                  <Link href={`/visitas/${visit.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent-soft">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{visit.cliente || "Sin cliente"}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {shortDate(visit.fecha)}
                        {visit.sede ? ` · ${visit.sede}` : ""} · {visit.responsable || "—"} · Visita {visit.numVisita || "—"}
                        {visit.status !== "final" ? " · Borrador" : ""}
                      </span>
                    </span>
                    {result ? <Badge tone={visit.resultadoFinal === "tec" ? "danger" : visit.resultadoFinal === "seg" ? "warn" : "ok"} size="sm">{result.name}</Badge> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
