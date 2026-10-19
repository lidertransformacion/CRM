import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const templates = await db.all("SELECT * FROM email_templates ORDER BY sort_order");
  return NextResponse.json({ templates });
}
