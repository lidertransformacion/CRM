import { NextResponse } from "next/server";
import { legalContext, legalError } from "@/lib/legal/http";
import { envelopeForUser, rejectStep, requestOtp, signStep } from "@/lib/legal/signatures";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const envelope = await envelopeForUser(db, actor, Number(id));
    return NextResponse.json({
      title: envelope.contract.title,
      code: envelope.contract.code,
      contractId: envelope.contract.id,
      status: envelope.request.status,
      publicId: envelope.request.public_id,
      finalSha256: envelope.request.final_sha256,
      rejectedReason: envelope.request.rejected_reason,
      canAct: envelope.canAct,
      steps: envelope.steps,
    });
  } catch (error) {
    return legalError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const requestId = Number(id);
    const body = (await request.json()) as {
      action?: string;
      otp?: string;
      consent?: boolean;
      typedName?: string;
      signaturePng?: string;
      reason?: string;
    };
    const origin = new URL(request.url).origin;
    if (body.action === "otp") {
      await requestOtp(db, actor, requestId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "reject") {
      await rejectStep(db, actor, requestId, body.reason ?? "", origin);
      return NextResponse.json({ ok: true });
    }
    const signed = await signStep(
      db,
      actor,
      { requestId, otp: body.otp ?? "", consent: body.consent === true, typedName: body.typedName, signaturePng: body.signaturePng },
      origin,
    );
    return NextResponse.json(signed);
  } catch (error) {
    return legalError(error);
  }
}
