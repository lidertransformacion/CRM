import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { reportNumber } from "@/lib/visits/calc";
import { visitPdf } from "@/lib/visits/pdf";
import { getDb } from "@/lib/db";
import { getVisit } from "@/lib/visits/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    const { id } = await context.params;
    const visit = await getVisit(db, id);
    if (!visit) throw new HttpError(404, "Esa visita no está en el historial.");
    const pdf = visitPdf(visit);
    const buffer = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(buffer).set(pdf);
    return new Response(new Blob([buffer], { type: "application/pdf" }), {
      headers: {
        "Content-Disposition": `attachment; filename="${reportNumber(visit)}.pdf"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
