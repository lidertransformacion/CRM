import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { readUsage } from "@/lib/storage/quota";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    return NextResponse.json(await readUsage(db));
  } catch (error) {
    return jsonError(error);
  }
}
