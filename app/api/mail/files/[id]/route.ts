import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { deleteMailFile, readMailFile } from "@/lib/mail/files";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    const { id } = await context.params;
    const loaded = await readMailFile(db, id);
    if (!loaded) throw new HttpError(404, "Ese archivo no está.");
    const bytes = loaded.bytes;
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return new Response(new Blob([copy], { type: loaded.row.content_type }), {
      headers: { "Content-Disposition": `inline; filename="${loaded.row.filename.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const { id } = await context.params;
    await deleteMailFile(db, session.uid, id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
