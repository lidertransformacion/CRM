import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { recalculateUsage } from "@/lib/storage/quota";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    if (session.role !== "admin") throw new HttpError(403, "Solo un administrador puede recalcular el almacén.");
    const result = await recalculateUsage(db);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
