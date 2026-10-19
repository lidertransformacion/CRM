import { NextResponse } from "next/server";
import { globalSearch } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Búsqueda global del buscador ⌘K: oportunidades, equipos y clientes en una sola llamada. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ leads: [], equipment: [], clients: [] });
  const found = await globalSearch(q);
  const leads = found.leads.map((lead) => ({ import_key: lead.import_key, name: lead.name, customer: lead.customer, stage: lead.stage }));
  const equipment = found.equipment.map((row) => ({ serial: row.serial, name: row.name, store_code: row.store_code, client_name: row.client_name }));
  const clients = found.clients.map((client) => ({ customer: client.customer, opportunities: client.opportunities, comodatos: client.comodatos }));
  return NextResponse.json({ leads, equipment, clients });
}
