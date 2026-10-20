import { NextResponse } from "next/server";
import { addNovedad } from "@/lib/legal/contracts";
import { legalContext, legalError } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const body = (await request.json()) as { kind?: string; body?: string; due_date?: string | null };
    const novedadId = await addNovedad(db, actor, Number(id), {
      kind: body.kind ?? "",
      body: body.body ?? "",
      due_date: body.due_date,
    });
    return NextResponse.json({ id: novedadId }, { status: 201 });
  } catch (error) {
    return legalError(error);
  }
}
