import { deleteFile, moveFile, openFileBytes, renameFile } from "@/lib/legal/drive";
import { legalContext, legalError, optionalId } from "@/lib/legal/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function safeName(name: string): string {
  return name.replace(/["\\\r\n]/g, "");
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const { file, object } = await openFileBytes(db, actor, Number(id));
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safeName(file.name)}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return legalError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const fileId = Number(id);
    const body = (await request.json()) as { name?: string; folder_id?: number | null };
    const file = body.name != null ? await renameFile(db, actor, fileId, body.name) : await moveFile(db, actor, fileId, optionalId(body.folder_id));
    return NextResponse.json({ file });
  } catch (error) {
    return legalError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    await deleteFile(db, actor, Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return legalError(error);
  }
}
