import { NextResponse } from "next/server";
import { agentAuthorized, jsonError } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { acknowledgeOutbound } from "@/lib/odoo/outbound";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** The browser agent reports the Odoo id it wrote, or the error it saw. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await hydrateProcessEnv();
    if (!(await agentAuthorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const outboundId = Number(id);
    if (!Number.isInteger(outboundId) || outboundId <= 0) return NextResponse.json({ error: "El id no es válido." }, { status: 400 });
    const body = (await request.json()) as { odooId?: string | number | null; error?: string | null };
    const db = await getSql();
    return NextResponse.json(await acknowledgeOutbound(db, outboundId, body));
  } catch (error) {
    return jsonError(error);
  }
}
