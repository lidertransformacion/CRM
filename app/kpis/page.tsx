import { KpiBoard } from "@/components/kpi/KpiBoard";
import { kpiData } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function KpiPage() {
  const data = await kpiData();
  return <KpiBoard team={data.team} people={data.people} targets={data.targets as { id: number; salesperson: string; metric: string; period: string; target_value: number }[]} asOf={data.asOf} />;
}
