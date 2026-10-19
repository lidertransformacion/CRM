import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/db";
import { STAGES } from "@/lib/odoo/stages";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ stages: STAGES, leads: await listLeads() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { importKey: string; patch: Record<string, string | number | null> };
  await updateLead(body.importKey, body.patch);
  return NextResponse.json({ ok: true });
}
