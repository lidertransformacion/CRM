import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const templates = getDb().prepare("SELECT * FROM email_templates ORDER BY sort_order").all();
  return NextResponse.json({ templates });
}
