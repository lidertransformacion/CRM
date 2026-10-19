import Link from "next/link";
import { ClipboardList, Mail } from "lucide-react";
import { LinkButton } from "@/components/home/LinkButton";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { relativeDays } from "@/lib/home/format";
import type { CommitteeSummary } from "@/lib/home/queries";
import { cn, longDate } from "@/lib/utils";

/** El comité en curso: cuándo fue (o será), cómo va y quién carga más pendientes. Acción principal de la pantalla. */
export function CommitteeCard({ committee, asOf }: { committee: CommitteeSummary; asOf: string }) {
  const upcoming = committee.heldOn >= asOf;
  return (
    <Card className="flex flex-col">
      <CardHeader
        eyebrow={upcoming ? "Próximo comité" : "Comité en curso"}
        title={`Comité ${committee.number}`}
        description={`${longDate(committee.heldOn)} · ${relativeDays(committee.heldOn, asOf)}`}
      />
      <CardBody className="flex-1">
        <dl className="grid grid-cols-3 gap-2">
          <Figure label="Abiertos" value={committee.open} />
          <Figure label="Cerrados" value={committee.closed} tone="ok" />
          <Figure label="Cerrados en este comité" value={committee.closedThisCommittee} tone="ok" />
        </dl>
        {committee.people.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-2">Más pendientes abiertos</p>
            <div className="flex flex-wrap gap-1.5">
              {committee.people.map((person) => (
                <Link
                  key={person.name}
                  href={person.href}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors hover:border-[rgba(24,43,85,.3)] hover:text-ink"
                >
                  {person.name}
                  <span className="num rounded-full bg-accent-soft px-1.5 text-[11px] leading-4">{person.open}</span>
                  {person.overdue > 0 && (
                    <span className="num rounded-full bg-danger-soft px-1.5 text-[11px] leading-4 text-danger" title={`${person.overdue} vencidos`}>
                      {person.overdue} venc.
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardBody>
      <CardFooter className="justify-start">
        <LinkButton href="/comites">
          <ClipboardList />
          Abrir comité
        </LinkButton>
        <LinkButton href="/comites?correo=1" variant="secondary">
          <Mail />
          Redactar correo resumen
        </LinkButton>
      </CardFooter>
    </Card>
  );
}

function Figure({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "ok" }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <dt className="text-[11px] leading-tight text-ink-3">{label}</dt>
      <dd className={cn("num mt-0.5 text-xl font-semibold leading-none", tone === "ok" ? "text-ok" : "text-ink")}>{value}</dd>
    </div>
  );
}
