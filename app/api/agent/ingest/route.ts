import { NextResponse } from "next/server";
import { agentAuthorized, jsonError } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { ingestSnapshot, type IngestRequest } from "@/lib/odoo/ingest";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** Browser-agent snapshot. This route never calls Odoo. */
export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    if (!(await agentAuthorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const body = (await request.json()) as IngestRequest;
    const db = await getSql();
    return NextResponse.json(await ingestSnapshot(db, body));
  } catch (error) {
    return jsonError(error);
  }
}
