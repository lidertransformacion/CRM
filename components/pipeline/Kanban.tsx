"use client";

import { useMemo, useState } from "react";
import { STAGES } from "@/lib/odoo/stages";
import { cop, displaySeller, shortDate } from "@/lib/utils";

type Card = {
  import_key: string;
  name: string;
  stage: string;
  team: string;
  salesperson: string;
  customer: string;
  expected_revenue: number | null;
  probability: number | null;
  next_activity_deadline: string | null;
  active: number;
};

export function Kanban({ initial }: { initial: Card[] }) {
  const [leads, setLeads] = useState(initial);
  const [q, setQ] = useState("");
  const [seller, setSeller] = useState("");
  const [team, setTeam] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const sellers = useMemo(() => [...new Set(initial.map((lead) => lead.salesperson))].sort(), [initial]);
  const teams = useMemo(() => [...new Set(initial.map((lead) => lead.team))].sort(), [initial]);
  const visible = leads.filter((lead) => {
    if (activeOnly && !lead.active) return false;
    if (seller && lead.salesperson !== seller) return false;
    if (team && lead.team !== team) return false;
    if (q && !`${lead.name} ${lead.customer} ${lead.salesperson}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  async function move(importKey: string, stage: string) {
    setLeads((rows) => rows.map((lead) => (lead.import_key === importKey ? { ...lead, stage, edited_locally: 1 } : lead)));
    await fetch("/api/pipeline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importKey, patch: { stage } }) });
  }

  return (
    <main className="px-4 py-5">
      <div className="mx-auto mb-4 flex max-w-[1400px] flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-[#98a2b3]">PAY LINE</p>
          <h1 className="font-serif text-4xl">Pipeline</h1>
          <p className="text-sm text-[#667085]">{visible.length} oportunidades · los cambios se quedan en este equipo</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="h-10 rounded-xl border bg-white px-3 text-sm" placeholder="Buscar cliente" value={q} onChange={(event) => setQ(event.target.value)} />
          <select className="h-10 rounded-xl border bg-white px-3 text-sm" value={seller} onChange={(event) => setSeller(event.target.value)}>
            <option value="">Todos los vendedores</option>
            {sellers.map((name) => <option key={name}>{name}</option>)}
          </select>
          <select className="h-10 rounded-xl border bg-white px-3 text-sm" value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="">Todos los equipos</option>
            {teams.map((name) => <option key={name}>{name}</option>)}
          </select>
          <button className={`h-10 rounded-xl px-3 text-sm ${activeOnly ? "bg-[var(--navy)] text-white" : "bg-white"}`} onClick={() => setActiveOnly((value) => !value)}>Solo activas</button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const cards = visible.filter((lead) => lead.stage === stage.name);
          const revenue = cards.reduce((sum, lead) => sum + (lead.expected_revenue ?? 0), 0);
          return (
            <section
              key={stage.name}
              className="w-[280px] shrink-0 rounded-3xl bg-white/80 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const key = event.dataTransfer.getData("text/plain");
                if (key) void move(key, stage.name);
              }}
            >
              <header className="mb-2 px-1">
                <p className="text-sm font-semibold">{stage.short}</p>
                <p className="text-xs text-[#667085]">{cards.length} · {cop(revenue)}</p>
              </header>
              <div className="space-y-2">
                {cards.map((lead) => {
                  const overdue = lead.next_activity_deadline && lead.next_activity_deadline < new Date().toISOString().slice(0, 10);
                  return (
                    <article key={lead.import_key} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", lead.import_key)} className="cursor-grab rounded-2xl bg-white p-3 shadow-sm">
                      <p className="text-sm font-semibold leading-snug">{lead.customer || lead.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[#667085]">{lead.name}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span>{displaySeller(lead.salesperson)}</span>
                        <span>{lead.expected_revenue ? cop(lead.expected_revenue) : "Sin ingreso"}</span>
                      </div>
                      {lead.probability != null && <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#eef1f6]"><div className="h-full bg-[var(--blue)]" style={{ width: `${Math.min(100, lead.probability)}%` }} /></div>}
                      {overdue && <p className="mt-2 text-[11px] font-medium text-rose-600">Actividad vencida · {shortDate(lead.next_activity_deadline)}</p>}
                      {!lead.active && <p className="mt-1 text-[11px] text-[#98a2b3]">Inactiva</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
