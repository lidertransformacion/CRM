"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { ClientList, type ClientSort } from "@/components/clients/ClientList";
import type { ClientRow, ClientTimelineResponse } from "@/components/clients/types";

/**
 * Lista + detalle de clientes. El cliente elegido vive en la URL (`?cliente=`) para que ⌘K,
 * Inicio y Pipeline puedan enlazarlo. En el celular la lista se pliega al elegir uno.
 */
export function ClientExplorer({ clients }: { clients: ClientRow[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("cliente");

  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<ClientSort>("pipeline");
  const [data, setData] = React.useState<ClientTimelineResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // En el celular, si se llega con ?cliente= la lista arranca plegada para ver el detalle de inmediato.
  const [listOpen, setListOpen] = React.useState(() => !selected);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!selected) {
      setData(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/clients?customer=${encodeURIComponent(selected)}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<ClientTimelineResponse>) : Promise.reject(new Error(String(response.status)))))
      .then((payload) => setData(payload))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError("Revisa que el servidor esté corriendo y vuelve a intentarlo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, attempt]);

  function select(customer: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cliente", customer);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    setListOpen(false);
  }

  const listHidden = !!selected && !listOpen;

  return (
    <div className="page">
      <PageHeader eyebrow="Seguimiento" title="Clientes" description="Todo lo que ha pasado con cada cliente: oportunidades, actividades, pendientes de comité y equipos." />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <ClientList
          clients={clients}
          q={q}
          onQueryChange={setQ}
          sort={sort}
          onSortChange={setSort}
          selected={selected}
          onSelect={select}
          className={cn(listHidden && "hidden lg:flex")}
        />
        {listHidden && (
          <Button variant="secondary" className="justify-start lg:hidden" onClick={() => setListOpen(true)}>
            <ChevronLeft />Cambiar de cliente
          </Button>
        )}
        <ClientDetail customer={selected} data={data} loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} />
      </div>
    </div>
  );
}
