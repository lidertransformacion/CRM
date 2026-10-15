import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { costFor, equipmentHistory, getEquipment, hourlyRate, maintenanceLogs } from "@/lib/db";
import { siteById, statusLabel } from "@/lib/equipment/catalog";
import { warrantyStateOn } from "@/lib/equipment/warranty";
import { addDays, cop, todayIso } from "@/lib/utils";
import { MaintenanceForm } from "@/components/equipment/MaintenanceForm";

export const dynamic = "force-dynamic";

export default async function LifeSheet({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const decoded = decodeURIComponent(serial);
  const equipment = getEquipment(decoded);
  if (!equipment) notFound();
  const history = equipmentHistory(decoded);
  const logs = maintenanceLogs(decoded);
  const rate = hourlyRate();
  const cost = costFor(equipment, rate);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "127.0.0.1";
  const proto = headerList.get("x-forwarded-proto") || "http";
  const url = `${proto}://${host}/comodatos/${encodeURIComponent(equipment.serial)}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 168 });
  const last = logs[0]?.performed_on;
  const next = last && equipment.maintenance_every_days ? addDays(last, equipment.maintenance_every_days) : null;
  const warranty = warrantyStateOn(equipment.warranty_until, equipment.warranty_state as "vigente" | "vencida" | "desconocida", todayIso());

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href="/comodatos" className="text-sm text-[var(--blue)]">Volver a equipos</Link>
      <article className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-[#98a2b3]">HOJA DE VIDA</p>
            <h1 className="font-serif text-4xl">{equipment.name}</h1>
            <p className="text-sm text-[#667085]">{equipment.store_code} · {equipment.asset_number} · {equipment.serial}</p>
          </div>
          <div className="rounded-2xl border p-2" dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Sede" value={siteById(equipment.site_id)?.name ?? equipment.site_id} />
          <Info label="Estado" value={statusLabel(equipment.status)} />
          <Info label="Cliente" value={equipment.client_name || "Sin cliente"} />
          <Info label="Dirección" value={[equipment.address, equipment.city].filter(Boolean).join(", ") || "—"} />
          <Info label="Entrega" value={equipment.delivered_on || "Sin fecha"} />
          <Info label="Vendedor" value={equipment.salesperson || "Sin vendedor"} />
          <Info label="Proveedor" value={equipment.supplier || "—"} />
          <Info label="Garantía" value={equipment.warranty_until ? `${equipment.warranty_until} · ${warranty}` : warranty} />
          <Info label="Próximo mantenimiento" value={next || "Sin fecha base"} />
          <Info label="Costo anual" value={cost ? cop(cost.annualCost) : "—"} />
        </dl>
      </article>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Seguimiento</h2>
        <div className="mt-3 space-y-2">
          {history.length === 0 && <p className="text-sm text-[#667085]">Todavía no hay movimientos.</p>}
          {history.map((event) => (
            <div key={event.id} className="text-sm">
              <p className="font-medium">{event.field}</p>
              <p className="text-xs text-[#667085]">{event.at.slice(0, 16).replace("T", " ")} · {event.from_value || "—"} → {event.to_value || "—"}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Mantenimientos</h2>
        <div className="mt-3 space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl bg-[#f6f7fb] p-3 text-sm">
              <p className="font-medium">{log.performed_on} · {log.kind}</p>
              <p className="text-[#667085]">{log.hours} h · {cop(log.visit_cost)} · {log.technician}</p>
              {log.notes && <p>{log.notes}</p>}
            </div>
          ))}
        </div>
        <MaintenanceForm serial={equipment.serial} />
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-[#98a2b3]">{label}</dt><dd>{value}</dd></div>;
}
