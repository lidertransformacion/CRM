import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/db";
import { STAGES } from "@/lib/odoo/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ stages: STAGES, leads: listLeads() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { importKey: string; patch: Record<string, string | number | null> };
  updateLead(body.importKey, body.patch);
  return NextResponse.json({ ok: true });
}
