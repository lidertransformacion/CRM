import { NextResponse } from "next/server";
import { createFolder, folderTree, listDrive } from "@/lib/legal/drive";
import { legalContext, legalError, optionalId } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const url = new URL(request.url);
    if (url.searchParams.get("tree") === "1") {
      return NextResponse.json({ folders: await folderTree(db, actor) });
    }
    const folderId = optionalId(url.searchParams.get("folder"));
    const listed = await listDrive(db, actor, folderId, url.searchParams.get("q") ?? "");
    return NextResponse.json(listed);
  } catch (error) {
    return legalError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const body = (await request.json()) as { name?: string; parent_id?: number | null };
    const folder = await createFolder(db, actor, optionalId(body.parent_id), body.name ?? "");
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return legalError(error);
  }
}
