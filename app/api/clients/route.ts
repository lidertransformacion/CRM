import { NextResponse } from "next/server";
import { clientDirectory, clientTimeline } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const customer = new URL(request.url).searchParams.get("customer");
  if (customer) return NextResponse.json(clientTimeline(customer));
  return NextResponse.json({ clients: clientDirectory() });
}
