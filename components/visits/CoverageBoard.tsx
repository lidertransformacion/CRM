import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { OWNER_LABEL, addDays, shortDate, weekLabel, type CoverageData } from "@/lib/visits/calc";

const SEGMENTS = ["todos", "adiaz", "jhiguera", "none"] as const;

function href(start: string, segment: string, list: string, query: string) {
  const params = new URLSearchParams();
  if (start) params.set("week", start);
  if (segment && segment !== "todos") params.set("seg", segment);
  if (list === "todos") params.set("lista", "todos");
  if (query) params.set("q", query);
  const text = params.toString();
  return text ? `/visitas?${text}` : "/visitas";
}

/** Weekly coverage: visits done against the points that were due, by commercial. */
export function CoverageBoard({ data, segment, list, query }: { data: CoverageData; segment: string; list: string; query: string }) {
  const attention = data.rows.filter((row) => row.dueThisWeek || row.visitState === "venc" || row.visitState === "sin");
  const shown = list === "todos" ? data.rows : attention;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={href(addDays(data.start, -7), segment, list, query)} className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
            Semana anterior
          </Link>
          <Link href={href(addDays(data.start, 7), segment, list, query)} className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
            Semana siguiente
          </Link>
        </div>
        <p className="text-sm text-ink-2">{weekLabel(data.start)}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {SEGMENTS.map((item) => (
          <Link key={item} href={href(data.start, item, list, query)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium ${segment === item ? "border-navy bg-navy text-crema" : "border-line bg-surface text-ink-2"}`}>
            {item === "todos" ? "Todo el equipo" : OWNER_LABEL[item]}
          </Link>
        ))}
      </div>
      <StatGrid cols={4}>
        <Stat label="Visitas hechas" value={data.kpi.visits} hint={`${data.kpi.points} puntos`} />
        <Stat label="Tocaba esta semana" value={`${data.kpi.done}/${data.kpi.due}`} hint="Hechas / que vencían en la semana" tone={data.kpi.due > data.kpi.done ? "warn" : "ok"} />
        <Stat label="Al día" value={data.kpi.onTime} hint={`de ${data.kpi.withFrequency} con frecuencia`} tone="ok" />
        <Stat label="Vencidas" value={data.kpi.overdue} hint={`${data.kpi.never} sin visita registrada`} tone={data.kpi.overdue ? "danger" : "neutral"} />
      </StatGrid>
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader title="Requieren atención" description="Resultado, equipo o frecuencia vencida" />
          <ul className="divide-y divide-line-2">
            {data.alerts.slice(0, 8).map((alert) => (
              <li key={alert.row.point.id} className="px-5 py-3">
                <p className="text-sm font-medium text-ink">
                  {alert.row.point.tradeName} <span className="font-normal text-ink-3">· {alert.row.point.pointName}</span>
                </p>
                <p className="text-xs text-ink-3">{alert.reasons.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader
          title={list === "todos" ? "Todos los puntos" : "Por cubrir"}
          description={list === "todos" ? "Frecuencia de cada punto del segmento" : "Vencen esta semana, están vencidos o todavía no tienen visita"}
          actions={
            <Link href={href(data.start, segment, list === "todos" ? "" : "todos", query)} className="text-sm font-medium text-navy underline">
              {list === "todos" ? "Solo lo pendiente" : "Ver todos"}
            </Link>
          }
        />
        {shown.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-2">Nada pendiente en esta semana para el segmento.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line-2">
            {shown.map((row) => (
              <li key={row.point.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{row.point.tradeName}</p>
                  <p className="text-xs text-ink-3">
                    {row.point.pointName} · {row.point.city} · {row.point.visitFrequency || "Sin frecuencia"} · {OWNER_LABEL[row.owner] || row.point.commercial}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.visitedWeek && <Badge tone="ok" size="sm">Visitado</Badge>}
                  {row.dueThisWeek && !row.visitedWeek && <Badge tone="warn" size="sm">Toca esta semana</Badge>}
                  {row.visitState === "venc" && <Badge tone="danger" size="sm">Vencida {row.overdueDays} d</Badge>}
                  {row.visitState === "sin" && <Badge tone="warn" size="sm">Sin visita</Badge>}
                  {row.visitState === "ok" && !row.dueThisWeek && <Badge tone="neutral" size="sm">Al día</Badge>}
                  {row.last && <span className="text-xs text-ink-3">{shortDate(row.last.fecha)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data.people.length > 0 && (
        <Card>
          <CardHeader title="Quién visitó" description="Visitas finalizadas de esta semana" />
          <ul className="divide-y divide-line-2">
            {data.people.map((person) => (
              <li key={person.name} className="px-5 py-3 text-sm">
                <span className="font-medium text-ink">{person.name}</span>
                <span className="text-ink-3"> · {person.role} · {person.visits} {person.visits === 1 ? "visita" : "visitas"}</span>
                <p className="text-xs text-ink-3">{person.points.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
