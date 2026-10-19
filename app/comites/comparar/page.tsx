import Link from "next/link";
import { ArrowLeft, GitCompare } from "lucide-react";
import { compareCommittees } from "@/lib/db";
import type { DiffRow } from "@/lib/committee/compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Toolbar } from "@/components/ui/page-header";
import { Stat, StatGrid } from "@/components/ui/stat";
import { longDate, shortDate } from "@/lib/utils";
import { CompareControls } from "@/components/committee/CompareControls";
import { plural } from "@/components/committee/helpers";

export const dynamic = "force-dynamic";

type Params = { left?: string; right?: string };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  let data = compareCommittees(Number(params.left) || 0, Number(params.right) || 0);
  const first = data.available[0]?.number ?? 1;
  const last = data.available.at(-1)?.number ?? first;
  const left = Number(params.left) || first;
  const right = Number(params.right) || last;
  if (!params.left || !params.right) data = compareCommittees(left, right);

  const latest = Math.max(last, ...data.cohorts.map((cohort) => cohort.number));
  const leftRow = data.available.find((item) => item.number === left);
  const rightRow = data.available.find((item) => item.number === right);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Comités"
        title="Comparar comités"
        description="Cuántos pendientes nacieron en cada comité y qué cambió entre dos actas archivadas."
        actions={
          <Button asChild variant="secondary">
            <Link href="/comites">
              <ArrowLeft /> Volver al tablero
            </Link>
          </Button>
        }
      >
        <Toolbar>
          {data.available.length > 0 ? <CompareControls available={data.available} left={left} right={right} /> : <p className="text-sm text-ink-3">Todavía no hay actas archivadas para comparar.</p>}
        </Toolbar>
      </PageHeader>

      <section className="mb-6" aria-labelledby="cohortes">
        <h2 id="cohortes" className="mb-1 font-sans text-[15px] font-semibold text-ink">Cohortes de nacimiento</h2>
        <p className="mb-3 text-xs text-ink-3">Por cada comité: cuántos pendientes nacieron ese día y cuántos siguen abiertos en el acta más reciente (#{latest}). Clic para ver la cohorte.</p>
        <StatGrid className="md:grid-cols-4 xl:grid-cols-7">
          {data.cohorts.map((cohort) => {
            const carry = latest - cohort.number;
            const tone = cohort.stillOpen === 0 ? (cohort.born > 0 ? "ok" : "neutral") : carry >= 2 ? "danger" : carry === 1 ? "warn" : "neutral";
            return (
              <Stat
                key={cohort.number}
                label={`Comité #${cohort.number} · ${shortDate(cohort.heldOn)}`}
                value={cohort.stillOpen}
                hint={`${plural(cohort.born, "nació", "nacieron")} · ${cohort.closed} cerrados`}
                tone={tone}
                href={cohort.number === latest ? "/comites" : `/comites?comite=${cohort.number}`}
              />
            );
          })}
        </StatGrid>
      </section>

      {data.diff ? (
        <section aria-labelledby="diff">
          <h2 id="diff" className="mb-1 font-sans text-[15px] font-semibold text-ink">
            Qué cambió entre el comité #{left} y el #{right}
          </h2>
          <p className="mb-3 text-xs text-ink-3">
            {leftRow && rightRow ? `Del ${longDate(leftRow.heldOn)} al ${longDate(rightRow.heldOn)}.` : ""} Cada pendiente se sigue por su identificador, aunque cambie de título.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DiffColumn title="Se cerraron o salieron" description="Estaban en la primera acta y ya no están abiertos en la segunda." tone="ok" rows={data.diff.closedBetween} />
            <DiffColumn title="Siguen abiertos" description="Aparecen en las dos actas sin cerrarse." tone="danger" rows={data.diff.stillOpen} />
            <DiffColumn title="Entraron después" description="Nuevos en la segunda acta." tone="info" rows={data.diff.added} />
          </div>
        </section>
      ) : (
        <Card>
          <EmptyState
            icon={<GitCompare />}
            title="No hay dos actas archivadas para comparar"
            description="El diff aparece cuando los dos comités elegidos tienen acta guardada. Los comités 1 a 6 son cohortes dentro del acta actual; al crear un comité nuevo, el actual queda archivado y ya se puede comparar."
            action={
              <Button asChild variant="secondary">
                <Link href="/comites">Ir al tablero</Link>
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}

function changeTone(change: string): "ok" | "danger" | "warn" | "info" | "neutral" {
  if (change.startsWith("Se cerró")) return "ok";
  if (change.startsWith("Nuevo")) return "info";
  if (change.startsWith("Sigue abierto")) {
    const carry = Number(change.match(/(\d+) comités/)?.[1] ?? 0);
    return carry >= 2 ? "danger" : carry === 1 ? "warn" : "neutral";
  }
  return "neutral";
}

function DiffColumn({ title, description, tone, rows }: { title: string; description: string; tone: "ok" | "danger" | "info"; rows: DiffRow[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={title} description={description} actions={<Badge tone={rows.length ? tone : "neutral"}>{plural(rows.length, "pendiente", "pendientes")}</Badge>} />
      <CardBody className="max-h-[520px] overflow-auto">
        {rows.length === 0 ? (
          <p className="py-2 text-xs text-ink-3">Ninguno.</p>
        ) : (
          <ul className="divide-y divide-line-2">
            {rows.map((row) => (
              <li key={row.id} className="space-y-1 py-2.5 text-sm">
                <p className="font-medium text-ink">{row.title}</p>
                <p className="truncate text-xs text-ink-3">
                  {row.topic}
                  {row.punto ? ` · ${row.punto}` : ""}
                </p>
                <Badge tone={changeTone(row.change)} size="sm">{row.change}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
