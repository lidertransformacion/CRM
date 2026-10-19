import { NextResponse } from "next/server";
import { agentAuthorized, jsonError } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { syncStatus } from "@/lib/odoo/ingest";
import { listPendingOutbound } from "@/lib/odoo/outbound";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** Pending creates and updates for the browser agent. This route never calls Odoo. */
export async function GET(request: Request) {
  try {
    await hydrateProcessEnv();
    if (!(await agentAuthorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const db = await getSql();
    const [pending, status] = await Promise.all([listPendingOutbound(db), syncStatus(db)]);
    return NextResponse.json({ pending, status });
  } catch (error) {
    return jsonError(error);
  }
}
