import { NextResponse } from "next/server";
import { searchLeads } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ leads: q.trim() ? searchLeads(q) : [] });
}
