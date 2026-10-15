"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { todayIso } from "@/lib/utils";

export function MaintenanceForm({ serial }: { serial: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ performedOn: todayIso(), kind: "preventivo", hours: "2", partsCost: "0", technician: "", notes: "", conditionAfter: "Operativo" });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/comodatos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial, ...form, hours: Number(form.hours), partsCost: Number(form.partsCost) }),
    });
    if (!response.ok) {
      setError("No se pudo registrar.");
      return;
    }
    setForm({ ...form, notes: "", partsCost: "0" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-2">
      <input className="rounded-xl border px-3 py-2 text-sm" type="date" value={form.performedOn} onChange={(event) => setForm({ ...form, performedOn: event.target.value })} />
      <select className="rounded-xl border px-3 py-2 text-sm" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
        <option value="preventivo">Preventivo</option>
        <option value="correctivo">Correctivo</option>
      </select>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Horas" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Repuestos" value={form.partsCost} onChange={(event) => setForm({ ...form, partsCost: event.target.value })} />
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Técnico" value={form.technician} onChange={(event) => setForm({ ...form, technician: event.target.value })} />
      <select className="rounded-xl border px-3 py-2 text-sm" value={form.conditionAfter} onChange={(event) => setForm({ ...form, conditionAfter: event.target.value })}>
        <option>Operativo</option>
        <option>Observación</option>
        <option>Fuera de servicio</option>
      </select>
      <textarea className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Qué se hizo" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white sm:col-span-2">Registrar mantenimiento</button>
    </form>
  );
}
