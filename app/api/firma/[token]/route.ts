import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth/users";
import { jsonError } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { publicEnvelope, rejectWithToken, requestPublicOtp, signWithToken } from "@/lib/legal/signatures";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

function meta(request: Request) {
  return {
    ip: request.headers.get("cf-connecting-ip"),
    userAgent: request.headers.get("user-agent"),
    origin: new URL(request.url).origin,
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!token || token.length < 20) throw new HttpError(404, "Este enlace de firma no es válido.");
    return NextResponse.json(await publicEnvelope(await getDb(), token));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const body = (await request.json()) as {
      action?: string;
      otp?: string;
      consent?: boolean;
      typedName?: string;
      signaturePng?: string;
      reason?: string;
    };
    const db = await getDb();
    const context = meta(request);
    if (body.action === "otp") {
      await requestPublicOtp(db, token, context.ip, context.userAgent);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "reject") {
      await rejectWithToken(db, token, body.reason ?? "", context);
      return NextResponse.json({ ok: true });
    }
    const signed = await signWithToken(
      db,
      token,
      { otp: body.otp ?? "", consent: body.consent === true, typedName: body.typedName, signaturePng: body.signaturePng },
      context,
    );
    return NextResponse.json(signed);
  } catch (error) {
    return jsonError(error);
  }
}
