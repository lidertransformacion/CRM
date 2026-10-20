import type { Metadata } from "next";
import Link from "next/link";
import { CoverageBoard } from "@/components/visits/CoverageBoard";
import { VisitImport } from "@/components/visits/VisitImport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RESULT } from "@/lib/visits/catalog";
import { bogotaToday, mondayOf, shortDate, weekData } from "@/lib/visits/calc";
import { getDb } from "@/lib/db";
import { ensureVisitPoints, listPoints, listVisits } from "@/lib/visits/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitas" };

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; seg?: string; lista?: string; q?: string }>;
}) {
  const params = await searchParams;
  const db = await getDb();
  await ensureVisitPoints(db);
  const [points, visits] = await Promise.all([listPoints(db), listVisits(db)]);
  const segment = params.seg && ["adiaz", "jhiguera", "none"].includes(params.seg) ? params.seg : "todos";
  const week = mondayOf(params.week || bogotaToday());
  const data = weekData(visits, points, week, segment, bogotaToday());
  const query = (params.q || "").trim().toLowerCase();
  const history = visits.filter((visit) => {
    if (!query) return true;
    return [visit.cliente, visit.razonSocial, visit.sede, visit.responsable, visit.tecnico].join(" ").toLowerCase().includes(query);
  });

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
        <form action="/visitas">
          <input type="hidden" name="week" value={week} />
          {segment !== "todos" && <input type="hidden" name="seg" value={segment} />}
          <div className="flex gap-2">
            <Input name="q" defaultValue={params.q || ""} placeholder="Buscar cliente, sede o responsable" aria-label="Buscar visitas" />
            <Button type="submit" variant="secondary">Buscar</Button>
          </div>
        </form>
      </PageHeader>
      <CoverageBoard data={data} segment={segment} list={params.lista === "todos" ? "todos" : ""} query={params.q || ""} />
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
