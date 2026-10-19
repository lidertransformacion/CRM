import { NextResponse } from "next/server";
import { currentCommittee } from "@/lib/db";
import { committeeCsv } from "@/lib/committee/email";
import { todayIso } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exporta el acta actual: `?format=csv` (una fila por pendiente) o JSON completo. */
export function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format");
  const doc = currentCommittee().doc;
  const name = `comite-${doc.committee.number}-${doc.committee.heldOn}`;
  if (format === "csv") {
    return new NextResponse(committeeCsv(doc, todayIso()), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${name}.csv`,
      },
    });
  }
  return NextResponse.json(doc, {
    headers: { "Content-Disposition": `attachment; filename=${name}.json` },
  });
}
