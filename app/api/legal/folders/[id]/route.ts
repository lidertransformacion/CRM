import { NextResponse } from "next/server";
import { deleteFolder, moveFolder, renameFolder } from "@/lib/legal/drive";
import { legalContext, legalError, optionalId } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const folderId = Number(id);
    const body = (await request.json()) as { name?: string; parent_id?: number | null };
    const folder = body.name != null
      ? await renameFolder(db, actor, folderId, body.name)
      : await moveFolder(db, actor, folderId, optionalId(body.parent_id));
    return NextResponse.json({ folder });
  } catch (error) {
    return legalError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    await deleteFolder(db, actor, Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return legalError(error);
  }
}
