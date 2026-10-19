import { NextResponse } from "next/server";
import { agentAuthorized, jsonError } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { commitSnapshot, type CommitRequest } from "@/lib/odoo/ingest";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** Archives leads missing from a batched full snapshot. This route never calls Odoo. */
export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    if (!(await agentAuthorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const body = (await request.json()) as CommitRequest;
    const db = await getSql();
    return NextResponse.json(await commitSnapshot(db, body));
  } catch (error) {
    return jsonError(error);
  }
}
