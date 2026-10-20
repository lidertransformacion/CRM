import { jsonError, requireSession } from "@/lib/auth/guard";
import { visitsCsv } from "@/lib/visits/calc";
import { getDb } from "@/lib/db";
import { listVisits } from "@/lib/visits/store";
import { bogotaToday } from "@/lib/visits/calc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    const csv = visitsCsv(await listVisits(db));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Historial_visitas_Libertario_${bogotaToday()}.csv"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
