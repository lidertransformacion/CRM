import type { Metadata } from "next";
import { VisitsScreen } from "@/components/visits/VisitsScreen";
import { bogotaToday, mondayOf } from "@/lib/visits/calc";
import { getDb } from "@/lib/db";
import { ensureVisitPoints, listPoints, listVisits } from "@/lib/visits/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitas" };

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; seg?: string; lista?: string; q?: string }>;
}) {
  const params = await searchParams;
  const db = await getDb();
  await ensureVisitPoints(db);
  const [points, visits] = await Promise.all([listPoints(db), listVisits(db)]);
  const segment = params.seg && ["adiaz", "jhiguera", "none"].includes(params.seg) ? params.seg : "todos";
  return (
    <VisitsScreen
      points={points}
      visits={visits}
      today={bogotaToday()}
      initialWeek={mondayOf(params.week || bogotaToday())}
      initialSegment={segment as "todos" | "adiaz" | "jhiguera" | "none"}
      initialList={params.lista === "todos" ? "todos" : ""}
      initialQuery={params.q || ""}
    />
  );
}
