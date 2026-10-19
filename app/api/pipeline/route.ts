import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/db";
import { leadByKey } from "@/lib/pipeline/queries";
import { STAGES, stageOf } from "@/lib/odoo/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ stages: STAGES, leads: listLeads() });
}

/** Guarda un cambio local sobre una oportunidad (etapa, ingreso, probabilidad…). No escribe en Odoo. */
export async function PATCH(request: Request) {
  let body: { importKey?: unknown; patch?: unknown };
  try {
    body = (await request.json()) as { importKey?: unknown; patch?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const importKey = typeof body.importKey === "string" ? body.importKey : "";
  const patch = body.patch && typeof body.patch === "object" ? (body.patch as Record<string, string | number | null>) : null;
  if (!importKey || !patch) return NextResponse.json({ error: "Faltan importKey o patch." }, { status: 400 });
  if (!leadByKey(importKey)) return NextResponse.json({ error: "No existe esa oportunidad." }, { status: 404 });
  if ("stage" in patch && (typeof patch.stage !== "string" || !stageOf(patch.stage))) {
    return NextResponse.json({ error: "Esa etapa no existe en el Pay Line." }, { status: 400 });
  }
  updateLead(importKey, patch);
  return NextResponse.json({ ok: true, lead: leadByKey(importKey) });
}
