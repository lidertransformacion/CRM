import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { saveMailFile } from "@/lib/mail/files";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Falta el archivo.");
    const saved = await saveMailFile(db, session.uid, {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({
      file: { id: saved.id, filename: saved.filename, contentType: saved.content_type, size: saved.size_bytes },
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
