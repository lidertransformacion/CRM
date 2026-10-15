"use client";

import { useState } from "react";
import { KPI_METRICS, metricActual, type SalesKpi } from "@/lib/kpi/compute";
import { cop, displaySeller } from "@/lib/utils";

type Target = { id: number; salesperson: string; metric: string; period: string; target_value: number };

export function KpiBoard({ team, people, targets: initialTargets, asOf }: { team: SalesKpi; people: SalesKpi[]; targets: Target[]; asOf: string }) {
  const [targets, setTargets] = useState(initialTargets);
  const [selected, setSelected] = useState(people[0]?.salesperson ?? "");
  const person = people.find((item) => item.salesperson === selected) ?? people[0];
  const [form, setForm] = useState({ salesperson: "", metric: "expected_revenue", period: asOf.slice(0, 7), targetValue: "" });

  async function addTarget() {
    await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, targetValue: Number(form.targetValue) }),
    });
    setTargets((rows) => [...rows, { id: Date.now(), salesperson: form.salesperson, metric: form.metric, period: form.period, target_value: Number(form.targetValue) }]);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div>
        <p className="text-xs tracking-[0.16em] text-[#98a2b3]">COMERCIAL · {asOf}</p>
        <h1 className="font-serif text-4xl">KPIs por vendedor</h1>
        <p className="max-w-2xl text-sm text-[#667085]">Abiertas, ganadas y perdidas salen de la etapa del pipeline. La antigüedad es desde la creación: el export no trae la fecha de entrada a la etapa. Las metas están vacías hasta que las definan.</p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Abiertas" value={String(team.open)} />
        <Stat label="Ganadas" value={String(team.won)} />
        <Stat label="Perdidas" value={String(team.lost)} />
        <Stat label="Tasa de cierre" value={team.winRate == null ? "—" : `${Math.round(team.winRate * 100)}%`} />
        <Stat label="Ingreso esperado" value={cop(team.expectedRevenue)} />
      </section>
      <div className="flex gap-2 overflow-x-auto">
        {people.map((item) => (
          <button key={item.salesperson} onClick={() => setSelected(item.salesperson)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${item.salesperson === person?.salesperson ? "bg-[var(--navy)] text-white" : "bg-white"}`}>
            {displaySeller(item.salesperson)}
          </button>
        ))}
      </div>
      {person && (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{person.salesperson}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Mini label="Abiertas" value={person.open} />
              <Mini label="Ganadas" value={person.won} />
              <Mini label="Perdidas" value={person.lost} />
              <Mini label="Recurrentes" value={person.recurrente} />
              <Mini label="Inactivas" value={person.inactive} />
              <Mini label="Actividades vencidas" value={person.overdueActivities} />
            </div>
            <p className="mt-4 text-sm">Pronóstico ponderado {cop(person.weightedRevenue)}</p>
            <div className="mt-4 space-y-2">
              {person.stageAging.map((stage) => (
                <div key={stage.stage}>
                  <div className="flex justify-between text-xs text-[#667085]"><span>{stage.short}</span><span>{stage.count} · {stage.avgDays} días</span></div>
                  <div className="mt-1 h-2 rounded-full bg-[#eef1f6]"><div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${Math.min(100, stage.avgDays / 4)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Metas</h2>
            <p className="text-sm text-[#667085]">Todavía no hay metas cargadas para este corte. Puedes dejar una y se compara con el número real.</p>
            <div className="mt-3 space-y-2 text-sm">
              {KPI_METRICS.map((metric) => {
                const actual = metricActual(person, metric.id);
                const target = targets.find((item) => item.metric === metric.id && (item.salesperson === person.salesperson || item.salesperson === ""));
                return (
                  <div key={metric.id} className="flex items-center justify-between gap-3 border-b border-[#f2f4f7] py-2">
                    <span>{metric.label}</span>
                    <span>{actual ?? "—"} <span className="text-[#98a2b3]">/ {target ? target.target_value : "sin meta"}</span></span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-2">
              <select className="rounded-xl border px-3 py-2 text-sm" value={form.salesperson} onChange={(event) => setForm({ ...form, salesperson: event.target.value })}>
                <option value="">Equipo</option>
                {people.map((item) => <option key={item.salesperson} value={item.salesperson}>{displaySeller(item.salesperson)}</option>)}
              </select>
              <select className="rounded-xl border px-3 py-2 text-sm" value={form.metric} onChange={(event) => setForm({ ...form, metric: event.target.value })}>
                {KPI_METRICS.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
              </select>
              <input className="rounded-xl border px-3 py-2 text-sm" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} />
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Valor" value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} />
              <button className="rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white" onClick={() => void addTarget()}>Guardar meta</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}
function Mini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-[#f6f7fb] p-3"><p className="text-xs text-[#667085]">{label}</p><p className="text-xl font-semibold">{value}</p></div>;
}
