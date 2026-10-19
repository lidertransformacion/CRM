"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, SquareKanban, Users } from "lucide-react";
import { cop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatGrid } from "@/components/ui/stat";
import { KIND_META, Timeline } from "@/components/clients/Timeline";
import type { ClientTimelineResponse, TimelineKind } from "@/components/clients/types";

const KINDS: TimelineKind[] = ["oportunidad", "actividad", "comité", "comodato"];

/** Panel derecho: cabecera del cliente con indicadores, acciones, filtros por tipo y línea de tiempo. */
export function ClientDetail({
  customer,
  data,
  loading,
  error,
  onRetry,
}: {
  customer: string | null;
  data: ClientTimelineResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [kinds, setKinds] = React.useState<TimelineKind[]>([]);
  React.useEffect(() => setKinds([]), [customer]);

  if (!customer) {
    return (
      <Card>
        <EmptyState
          icon={<Users />}
          title="Elige un cliente de la lista o búscalo con el buscador"
          description="Verás en una sola línea de tiempo sus oportunidades, actividades, pendientes de comité y equipos en comodato."
        />
      </Card>
    );
  }

  const summary = data?.customer === customer ? data.summary : null;
  const events = data?.customer === customer ? data.events : [];
  const counts = KINDS.reduce<Record<TimelineKind, number>>((acc, kind) => ({ ...acc, [kind]: events.filter((event) => event.kind === kind).length }), {
    oportunidad: 0,
    actividad: 0,
    comité: 0,
    comodato: 0,
  });
  const filtered = kinds.length ? events.filter((event) => kinds.includes(event.kind)) : events;
  const mailHref = summary?.latestLeadKey
    ? `/correos?lead=${encodeURIComponent(summary.latestLeadKey)}&cliente=${encodeURIComponent(customer)}`
    : `/correos?cliente=${encodeURIComponent(customer)}`;

  function toggleKind(kind: TimelineKind) {
    setKinds((current) => (current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind]));
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Cliente"
        title={customer}
        description={summary ? `${summary.open} abiertas · ${summary.won} ganadas · ${summary.lost} perdidas${summary.overdueActivities ? ` · ${summary.overdueActivities} actividades vencidas` : ""}` : "Cargando…"}
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/pipeline?q=${encodeURIComponent(customer)}`}><SquareKanban />Ver en pipeline</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={mailHref}><Mail />Redactar correo</Link>
            </Button>
          </>
        }
      />
      <CardBody className="space-y-5">
        {error ? (
          <EmptyState compact title="No se pudo cargar la línea de tiempo" description={error} action={<Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>} />
        ) : loading || !summary ? (
          <div className="space-y-4" aria-busy>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <>
            <StatGrid className="grid-cols-1 sm:grid-cols-3 xl:grid-cols-3">
              <Stat label="Oportunidades" value={summary.opportunities} hint={`${summary.won} ganadas · ${summary.lost} perdidas${summary.recurrent ? ` · ${summary.recurrent} recurrentes` : ""}`} />
              <Stat label="Pipeline abierto" value={cop(summary.openPipeline)} hint={`${summary.open} ${summary.open === 1 ? "abierta" : "abiertas"}`} tone="info" />
              <Stat label="Equipos" value={summary.comodatos} hint="en comodato" tone={summary.comodatos ? "ok" : "neutral"} />
            </StatGrid>
            <Toolbar>
              {KINDS.map((kind) => (
                <Chip key={kind} active={kinds.includes(kind)} count={counts[kind]} disabled={counts[kind] === 0} onClick={() => toggleKind(kind)} className="disabled:opacity-50">
                  {KIND_META[kind].plural}
                </Chip>
              ))}
              {kinds.length > 0 && <Button variant="ghost" size="sm" onClick={() => setKinds([])}>Ver todo</Button>}
            </Toolbar>
            <Timeline events={filtered} />
          </>
        )}
      </CardBody>
    </Card>
  );
}
