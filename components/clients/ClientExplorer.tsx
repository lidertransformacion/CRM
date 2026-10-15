"use client";

import { useState } from "react";
import { cop } from "@/lib/utils";

type Client = { customer: string; opportunities: number; pipeline: number; comodatos: number };
type Event = { at: string; kind: string; title: string; detail: string };

export function ClientExplorer({ clients }: { clients: Client[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const visible = clients.filter((client) => client.customer.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  async function open(customer: string) {
    setSelected(customer);
    const response = await fetch(`/api/clients?customer=${encodeURIComponent(customer)}`);
    const payload = (await response.json()) as { events: Event[] };
    setEvents(payload.events);
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section>
        <p className="text-xs tracking-[0.16em] text-[#98a2b3]">SEGUIMIENTO</p>
        <h1 className="font-serif text-4xl">Clientes</h1>
        <input className="mt-3 h-10 w-full rounded-xl border bg-white px-3 text-sm" placeholder="Buscar cliente" value={q} onChange={(event) => setQ(event.target.value)} />
        <div className="mt-3 space-y-2">
          {visible.map((client) => (
            <button key={client.customer} onClick={() => void open(client.customer)} className={`block w-full rounded-2xl bg-white p-3 text-left shadow-sm ${selected === client.customer ? "ring-2 ring-[var(--blue)]" : ""}`}>
              <p className="font-medium">{client.customer}</p>
              <p className="text-xs text-[#667085]">{client.opportunities} oportunidades · {client.comodatos} equipos · {cop(client.pipeline)}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        {!selected && <p className="text-sm text-[#667085]">Elige un cliente para ver oportunidades, actividades, pendientes de comité y comodatos.</p>}
        {selected && (
          <>
            <h2 className="font-semibold">{selected}</h2>
            <div className="mt-4 space-y-3">
              {events.length === 0 && <p className="text-sm text-[#667085]">No hay eventos para este cliente.</p>}
              {events.map((event, index) => (
                <div key={`${event.at}-${index}`} className="border-l-2 border-[#e4e7ef] pl-3">
                  <p className="text-xs text-[#98a2b3]">{event.at} · {event.kind}</p>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-[#667085]">{event.detail}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
