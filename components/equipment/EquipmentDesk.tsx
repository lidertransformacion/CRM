"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COMODATO_STATUSES, SITES, siteById, statusLabel, storeCode } from "@/lib/equipment/catalog";
import { maintenanceCost, warrantyStateOn, type WarrantyState } from "@/lib/equipment/warranty";
import type { EquipmentRow } from "@/lib/db";
import { cop, todayIso } from "@/lib/utils";

const fieldClass = "w-full rounded-xl border border-[#e1e5ef] bg-white px-2.5 py-2 text-sm";

type Lists = { categories: string[]; clients: string[]; cities: string[]; suppliers: string[]; salespeople: string[] };

const EMPTY = {
  serial: "",
  name: "",
  category: "",
  siteId: "COM",
  supplier: "",
  supplierReference: "",
  model: "",
  warrantyUntil: "",
  everyDays: "90",
  hoursMin: "1",
  hoursMax: "3",
  clientName: "",
  address: "",
  city: "",
  status: "en_tienda",
  deliveredOn: "",
  salesperson: "",
  notes: "",
};

function toForm(row: EquipmentRow) {
  return {
    serial: row.serial,
    name: row.name,
    category: row.category,
    siteId: row.site_id,
    supplier: row.supplier ?? "",
    supplierReference: row.supplier_reference ?? "",
    model: row.model ?? "",
    warrantyUntil: row.warranty_until ?? "",
    everyDays: row.maintenance_every_days ? String(row.maintenance_every_days) : "",
    hoursMin: row.hours_min == null ? "" : String(row.hours_min),
    hoursMax: row.hours_max == null ? "" : String(row.hours_max),
    clientName: row.client_name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    status: row.status,
    deliveredOn: row.delivered_on ?? "",
    salesperson: row.salesperson ?? "",
    notes: row.notes ?? "",
  };
}

export function EquipmentDesk({ initial, lists, hourlyRate }: { initial: EquipmentRow[]; lists: Lists; hourlyRate: number }) {
  const [rows, setRows] = useState(initial);
  const [catalogs, setCatalogs] = useState(lists);
  const [rate, setRate] = useState(hourlyRate);
  const [query, setQuery] = useState("");
  const [site, setSite] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(initial[0]?.serial ?? null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(() => (initial[0] ? toForm(initial[0]) : EMPTY));
  const [message, setMessage] = useState("");
  const [sync, setSync] = useState<string>("");
  const serialRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (site && row.site_id !== site) return false;
        if (status && row.status !== status) return false;
        if (query && !`${row.serial} ${row.name} ${row.client_name ?? ""} ${row.store_code}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [rows, site, status, query],
  );

  function load(row: EquipmentRow) {
    setCreating(false);
    setSelected(row.serial);
    setMessage("");
    setForm(toForm(row));
  }

  useEffect(() => {
    if (creating) serialRef.current?.focus();
  }, [creating]);

  function startNew() {
    setCreating(true);
    setSelected(null);
    setMessage("");
    setForm({ ...EMPTY, category: catalogs.categories[0] ?? "" });
  }

  const previewCode = useMemo(() => {
    if (!creating && selected) {
      const current = rows.find((row) => row.serial === selected);
      if (current && current.site_id === form.siteId) return current.store_code;
    }
    const max = rows.filter((row) => row.site_id === form.siteId).reduce((n, row) => Math.max(n, row.site_seq), 0);
    return storeCode(form.siteId, max + 1);
  }, [creating, selected, rows, form.siteId]);

  const cost = maintenanceCost({
    everyDays: form.everyDays ? Number(form.everyDays) : null,
    hoursMin: form.hoursMin ? Number(form.hoursMin) : null,
    hoursMax: form.hoursMax ? Number(form.hoursMax) : null,
    hourlyRate: rate,
  });

  async function save() {
    setMessage("");
    const payload = {
      serial: form.serial.trim(),
      name: form.name.trim(),
      category: form.category,
      siteId: form.siteId,
      supplier: form.supplier,
      supplierReference: form.supplierReference,
      model: form.model,
      warrantyUntil: form.warrantyUntil || null,
      everyDays: form.everyDays ? Number(form.everyDays) : null,
      hoursMin: form.hoursMin ? Number(form.hoursMin) : null,
      hoursMax: form.hoursMax ? Number(form.hoursMax) : null,
      clientName: form.clientName || null,
      address: form.address,
      city: form.city,
      status: form.clientName && form.status === "en_tienda" && creating ? "en_comodato" : form.status,
      deliveredOn: form.deliveredOn || null,
      salesperson: form.salesperson || null,
      notes: form.notes,
    };
    const response = await fetch("/api/comodatos", {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { equipment?: EquipmentRow; error?: string };
    if (!response.ok || !body.equipment) {
      setMessage(body.error || "No se pudo guardar.");
      return;
    }
    setRows((current) => {
      const next = current.filter((row) => row.serial !== body.equipment!.serial);
      return [...next, body.equipment!].sort((a, b) => a.site_id.localeCompare(b.site_id) || a.site_seq - b.site_seq);
    });
    load(body.equipment);
    setMessage("Guardado.");
  }

  async function addToList(kind: "category" | "client" | "supplier" | "city", value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    await fetch("/api/comodatos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogKind: kind, catalogValue: trimmed }) });
    setCatalogs((current) => ({ ...current, [`${kind === "category" ? "categories" : kind === "client" ? "clients" : kind === "supplier" ? "suppliers" : "cities"}`]: [...new Set([...current[kind === "category" ? "categories" : kind === "client" ? "clients" : kind === "supplier" ? "suppliers" : "cities"], trimmed])].sort() }));
  }

  async function showSync() {
    const response = await fetch("/api/comodatos?view=sync");
    const plan = await response.json();
    const lines = [
      `Modo: ${plan.mode}. No se escribió nada en la hoja.`,
      `Actualizaciones: ${plan.push.updates.length}`,
      `Altas: ${plan.push.inserts.length}`,
      `Bajas: ${plan.push.deletes.length} (el adaptador no borra filas)`,
      ...plan.push.updates.slice(0, 8).flatMap((update: { serial: string; rowNumber: number; changes: { column: string; from: string; to: string }[] }) =>
        update.changes.map((change) => `${update.serial} · fila ${update.rowNumber} encontrada por serial · ${change.column}: "${change.from}" → "${change.to}"`),
      ),
    ];
    setSync(lines.join("\n"));
  }

  async function copySync() {
    if (!sync) return;
    await navigator.clipboard.writeText(sync);
    setMessage("Diff copiado. Nada se escribió en la hoja.");
  }

  const warrantyFallback = ((rows.find((row) => row.serial === selected)?.warranty_state as WarrantyState | undefined) ?? "desconocida");

  return (
    <main className="mx-auto grid max-w-[1280px] gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-[#98a2b3]">COMODATOS</p>
            <h1 className="font-serif text-4xl">Equipos</h1>
            <p className="text-sm text-[#667085]">{rows.length} equipos · el serial es la clave</p>
          </div>
          <button className="rounded-full bg-[var(--blue)] px-4 py-2 text-sm text-white" onClick={startNew}>Nuevo equipo</button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="h-10 flex-1 rounded-xl border bg-white px-3 text-sm" placeholder="Serial, equipo o cliente" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="h-10 rounded-xl border bg-white px-3 text-sm" value={site} onChange={(event) => setSite(event.target.value)}>
            <option value="">Todas las sedes</option>
            {SITES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="h-10 rounded-xl border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {COMODATO_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[#98a2b3]">
              <tr><th className="px-3 py-2">Código</th><th>Equipo</th><th>Sede</th><th>Cliente</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 80).map((row) => (
                <tr key={row.serial} onClick={() => load(row)} className={`cursor-pointer border-t border-[#f2f4f7] ${selected === row.serial ? "bg-[#f4f7ff]" : "hover:bg-[#fafbfe]"}`}>
                  <td className="px-3 py-2 font-medium">{row.store_code}</td>
                  <td>{row.name}<span className="block text-xs text-[#98a2b3]">{row.serial}</span></td>
                  <td>{siteById(row.site_id)?.name ?? row.site_id}</td>
                  <td>{row.client_name || "—"}</td>
                  <td>{statusLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 80 && <p className="px-3 py-2 text-xs text-[#98a2b3]">Mostrando 80 de {filtered.length}. Afina la búsqueda.</p>}
        </div>
        <section className="mt-4 rounded-3xl bg-white p-4 text-sm shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Google Sheets</h2>
            <div className="flex gap-2">
              <button className="rounded-full border px-3 py-1" onClick={() => void showSync()}>Ver diff</button>
              {sync && <button className="rounded-full border px-3 py-1" onClick={() => void copySync()}>Copiar</button>}
            </div>
          </div>
          <p className="mt-1 text-[#667085]">Sincronización apagada. El diff muestra qué celdas se escribirían, buscando cada fila por serial. No borra filas y no toca las columnas de fórmula.</p>
          {sync && <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[#f6f7fb] p-3 text-xs">{sync}</pre>}
        </section>
      </section>

      <form className="h-max space-y-3 rounded-3xl bg-white p-4 shadow-sm lg:sticky lg:top-20" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{creating ? "Nuevo equipo" : "Editar"}</h2>
          {!creating && selected && <Link className="text-sm text-[var(--blue)]" href={`/comodatos/${encodeURIComponent(selected)}`}>Hoja de vida</Link>}
        </div>
        <Field label="Serial">
          <input ref={serialRef} required className={fieldClass} value={form.serial} disabled={!creating} onChange={(event) => setForm({ ...form, serial: event.target.value })} />
        </Field>
        <Field label="Nombre">
          <input required className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="Categoría">
          <select required className={fieldClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            <option value="">Elegir</option>
            {catalogs.categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Sede">
          <select className={fieldClass} value={form.siteId} onChange={(event) => setForm({ ...form, siteId: event.target.value })}>
            {SITES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <p className="rounded-2xl bg-[#f6f7fb] px-3 py-2 text-sm">Código tienda <strong>{previewCode}</strong><span className="block text-xs text-[#667085]">{creating ? "El activo general se asigna al guardar." : rows.find((row) => row.serial === selected)?.asset_number}</span></p>
        <Field label="Estado">
          <select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {COMODATO_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Cliente">
          <select className={fieldClass} value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value, status: event.target.value ? "en_comodato" : form.status })}>
            <option value="">Sin cliente</option>
            {catalogs.clients.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Dirección"><input className={fieldClass} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
        <Field label="Ciudad">
          <select className={fieldClass} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })}>
            <option value="">Sin ciudad</option>
            {catalogs.cities.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Entrega"><input className={fieldClass} type="date" value={form.deliveredOn} onChange={(event) => setForm({ ...form, deliveredOn: event.target.value })} /></Field>
        <Field label="Vendedor">
          <select className={fieldClass} value={form.salesperson} onChange={(event) => setForm({ ...form, salesperson: event.target.value })}>
            <option value="">Sin vendedor</option>
            {catalogs.salespeople.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Proveedor">
          <select className={fieldClass} value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}>
            <option value="">Sin proveedor</option>
            {catalogs.suppliers.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Referencia proveedor"><input className={fieldClass} value={form.supplierReference} onChange={(event) => setForm({ ...form, supplierReference: event.target.value })} /></Field>
        <Field label="Modelo"><input className={fieldClass} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
        <Field label="Garantía hasta">
          <input className={fieldClass} type="date" value={form.warrantyUntil} onChange={(event) => setForm({ ...form, warrantyUntil: event.target.value })} />
        </Field>
        <p className="text-xs text-[#667085]">Estado de garantía: {warrantyStateOn(form.warrantyUntil || null, form.warrantyUntil ? "vigente" : warrantyFallback, todayIso())}</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Cada (días)"><input className={fieldClass} value={form.everyDays} onChange={(event) => setForm({ ...form, everyDays: event.target.value })} /></Field>
          <Field label="Horas mín"><input className={fieldClass} value={form.hoursMin} onChange={(event) => setForm({ ...form, hoursMin: event.target.value })} /></Field>
          <Field label="Horas máx"><input className={fieldClass} value={form.hoursMax} onChange={(event) => setForm({ ...form, hoursMax: event.target.value })} /></Field>
        </div>
        <p className="text-sm">Costo anual estimado <strong>{cost ? cop(cost.annualCost) : "—"}</strong> <span className="text-xs text-[#98a2b3]">con tarifa {cop(rate)}/hora</span></p>
        <label className="block text-xs text-[#667085]">Tarifa hora
          <input className={fieldClass} type="number" value={rate} onChange={async (event) => {
            const value = Number(event.target.value);
            setRate(value);
            await fetch("/api/comodatos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hourlyRate: value }) });
          }} />
        </label>
        <ListAdder label="Agregar categoría" onAdd={(value) => void addToList("category", value)} />
        <ListAdder label="Agregar cliente" onAdd={(value) => void addToList("client", value)} />
        <Field label="Notas"><textarea className={fieldClass} rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <button className="w-full rounded-full bg-[var(--navy)] py-2.5 text-sm text-white">Guardar equipo</button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-[#667085]">{label}<div className="mt-1">{children}</div></label>;
}

function ListAdder({ label, onAdd }: { label: string; onAdd: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input className={fieldClass} placeholder={label} value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" className="rounded-xl border px-3 text-xs" onClick={() => { onAdd(value); setValue(""); }}>Añadir</button>
    </div>
  );
}
