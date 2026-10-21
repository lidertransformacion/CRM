import { NextResponse } from "next/server";
import { legalContext, legalError } from "@/lib/legal/http";
import { cancelSignature, latestSignature, sendForSignature } from "@/lib/legal/signatures";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function originOf(request: Request): string {
  return new URL(request.url).origin;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const row = await latestSignature(db, Number(id));
    if (!row) return NextResponse.json({ request: null });
    if (actor.role !== "admin" && actor.role !== "legal" && actor.role !== "gerencia" && row.created_by !== actor.uid) {
      return NextResponse.json({ request: { id: row.id, status: row.status, publicId: row.public_id } });
    }
    return NextResponse.json({
      request: { id: row.id, status: row.status, publicId: row.public_id, finalSha256: row.final_sha256, rejectedReason: row.rejected_reason },
    });
  } catch (error) {
    return legalError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const body = (await request.json()) as { action?: string };
    const contractId = Number(id);
    if (body.action === "cancel") {
      await cancelSignature(db, actor, contractId);
      return NextResponse.json({ ok: true });
    }
    const sent = await sendForSignature(db, actor, contractId, originOf(request));
    return NextResponse.json(sent);
  } catch (error) {
    return legalError(error);
  }
}
