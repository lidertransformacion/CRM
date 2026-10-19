import { NextResponse } from "next/server";
import { currentCommittee } from "@/lib/db";
import { committeeCsv } from "@/lib/committee/email";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format");
  const doc = (await currentCommittee()).doc;
  if (format === "csv") {
    return new NextResponse(committeeCsv(doc, todayIso()), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=comite.csv",
      },
    });
  }
  return NextResponse.json(doc, {
    headers: { "Content-Disposition": "attachment; filename=comite.json" },
  });
}
