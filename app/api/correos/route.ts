import { NextResponse } from "next/server";
import { listEmailTemplates } from "@/lib/emails/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plantillas de correo. Solo lectura: este módulo no envía nada. */
export function GET() {
  return NextResponse.json({ templates: listEmailTemplates() });
}
