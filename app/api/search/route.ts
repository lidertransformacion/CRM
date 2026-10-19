import { NextResponse } from "next/server";
import { clientDirectory, listEquipment, searchLeads } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Búsqueda global del buscador ⌘K: oportunidades, equipos y clientes en una sola llamada. */
export function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ leads: [], equipment: [], clients: [] });
  const needle = q.toLowerCase();
  const leads = searchLeads(q)
    .slice(0, 6)
    .map((lead) => ({ import_key: lead.import_key, name: lead.name, customer: lead.customer, stage: lead.stage }));
  const equipment = listEquipment()
    .filter((row) => `${row.serial} ${row.name} ${row.store_code} ${row.asset_number} ${row.client_name ?? ""}`.toLowerCase().includes(needle))
    .slice(0, 6)
    .map((row) => ({ serial: row.serial, name: row.name, store_code: row.store_code, client_name: row.client_name }));
  const clients = clientDirectory()
    .filter((client) => client.customer.toLowerCase().includes(needle))
    .slice(0, 6)
    .map((client) => ({ customer: client.customer, opportunities: client.opportunities, comodatos: client.comodatos }));
  return NextResponse.json({ leads, equipment, clients });
}
