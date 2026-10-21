import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { lookupPdf, lookupSha256 } from "@/lib/legal/verify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const sha = new URL(request.url).searchParams.get("sha256") ?? "";
    return NextResponse.json(await lookupSha256(await getDb(), sha));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("sha256");
    const db = await getDb();
    if (file instanceof File && file.size > 0) {
      if (file.size > 25 * 1024 * 1024) throw new HttpError(400, "El PDF no puede pasar de 25 MB.");
      return NextResponse.json(await lookupPdf(db, new Uint8Array(await file.arrayBuffer())));
    }
    if (typeof pasted === "string") return NextResponse.json(await lookupSha256(db, pasted));
    throw new HttpError(400, "Sube un PDF o pega un hash SHA-256.");
  } catch (error) {
    return jsonError(error);
  }
}
