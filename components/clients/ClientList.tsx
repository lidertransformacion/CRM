"use client";

import * as React from "react";
import { cn, cop } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import type { ClientRow } from "@/components/clients/types";

export type ClientSort = "pipeline" | "name" | "equipment";
const PAGE = 50;
const FIRST_PAGE = 80;

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Panel izquierdo: buscador, orden y la lista completa de clientes (por páginas de 50). */
export function ClientList({
  clients,
  q,
  onQueryChange,
  sort,
  onSortChange,
  selected,
  onSelect,
  className,
}: {
  clients: ClientRow[];
  q: string;
  onQueryChange: (value: string) => void;
  sort: ClientSort;
  onSortChange: (value: ClientSort) => void;
  selected: string | null;
  onSelect: (customer: string) => void;
  className?: string;
}) {
  const [limit, setLimit] = React.useState(FIRST_PAGE);
  React.useEffect(() => setLimit(FIRST_PAGE), [q, sort]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle ? clients.filter((client) => client.customer.toLowerCase().includes(needle)) : [...clients];
    rows.sort((a, b) => {
      if (sort === "name") return a.customer.localeCompare(b.customer, "es", { sensitivity: "base" });
      if (sort === "equipment") return b.comodatos - a.comodatos || b.pipeline - a.pipeline || a.customer.localeCompare(b.customer, "es");
      return b.pipeline - a.pipeline || b.opportunities - a.opportunities || a.customer.localeCompare(b.customer, "es");
    });
    return rows;
  }, [clients, q, sort]);

  const rows = filtered.slice(0, limit);

  return (
    <Card className={cn("flex flex-col lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-96px)]", className)}>
      <div className="space-y-2 border-b border-line-2 p-3">
        <SearchInput value={q} onChange={onQueryChange} placeholder="Buscar cliente" aria-label="Buscar cliente" />
        <Segmented<ClientSort>
          size="sm"
          ariaLabel="Ordenar clientes"
          value={sort}
          onChange={onSortChange}
          options={[
            { value: "pipeline", label: "Pipeline" },
            { value: "name", label: "Nombre" },
            { value: "equipment", label: "Equipos" },
          ]}
        />
      </div>
      <ul className="min-h-0 max-h-[46vh] flex-1 overflow-y-auto p-2 lg:max-h-none" aria-label="Clientes">
        {rows.map((client) => {
          const active = client.customer === selected;
          return (
            <li key={client.customer}>
              <button
                type="button"
                onClick={() => onSelect(client.customer)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40",
                  active && "bg-accent-soft ring-1 ring-navy/30 hover:bg-accent-soft",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{client.customer}</p>
                  {client.pipeline > 0 && <span className="num shrink-0 text-xs text-ink-2">{cop(client.pipeline)}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {client.opportunities > 0 && <Badge size="sm">{plural(client.opportunities, "oportunidad", "oportunidades")}</Badge>}
                  {client.comodatos > 0 && <Badge size="sm" tone="info">{plural(client.comodatos, "equipo", "equipos")}</Badge>}
                  {client.opportunities === 0 && client.comodatos === 0 && <Badge size="sm" tone="outline">Sin registros</Badge>}
                </div>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <EmptyState compact title="Sin clientes" description={q ? `Nada coincide con “${q}”.` : "Todavía no hay clientes en el export."} />}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-line-2 px-3 py-2 text-xs text-ink-3">
        <span className="num">{rows.length} de {filtered.length}</span>
        {rows.length < filtered.length && (
          <Button variant="secondary" size="sm" onClick={() => setLimit((value) => value + PAGE)}>Mostrar {Math.min(PAGE, filtered.length - rows.length)} más</Button>
        )}
      </div>
    </Card>
  );
}
