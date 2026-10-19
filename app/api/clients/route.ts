import { NextResponse } from "next/server";
import { clientDirectory, clientTimeline } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = new URL(request.url).searchParams.get("customer");
  if (customer) return NextResponse.json(await clientTimeline(customer));
  return NextResponse.json({ clients: await clientDirectory() });
}
