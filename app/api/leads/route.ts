import { NextResponse } from "next/server";
import { searchLeads } from "@/lib/db";
import { leadDetail } from "@/lib/pipeline/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads?q=texto   → búsqueda rápida (la usan comités y correos).
 * GET /api/leads?key=clave → una oportunidad con sus actividades (panel del pipeline).
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  if (key) {
    const detail = leadDetail(key);
    if (!detail) return NextResponse.json({ error: "No existe esa oportunidad en el export." }, { status: 404 });
    return NextResponse.json(detail);
  }
  const q = params.get("q") ?? "";
  return NextResponse.json({ leads: q.trim() ? searchLeads(q) : [] });
}
