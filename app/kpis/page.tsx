import type { Metadata } from "next";
import { KpiBoard } from "@/components/kpi/KpiBoard";
import { kpiData } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "KPIs" };

export default function KpiPage() {
  const data = kpiData();
  return <KpiBoard team={data.team} people={data.people} targets={data.targets} asOf={data.asOf} />;
}
