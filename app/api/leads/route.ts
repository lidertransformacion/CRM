import { NextResponse } from "next/server";
import { searchLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ leads: q.trim() ? await searchLeads(q) : [] });
}
