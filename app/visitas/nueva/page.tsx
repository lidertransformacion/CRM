import type { Metadata } from "next";
import { VisitWizard } from "@/components/visits/VisitWizard";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db";
import { assignVisitNumber, blankVisit, prefillFromVisit } from "@/lib/visits/model";
import { ensureVisitPoints, getVisit, listPoints, listVisitBriefs } from "@/lib/visits/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva visita" };

export default async function NuevaVisitaPage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const params = await searchParams;
  const db = await getDb();
  await ensureVisitPoints(db);
  const [points, briefs] = await Promise.all([listPoints(db), listVisitBriefs(db)]);
  let initial = blankVisit();
  if (params.desde) {
    const source = await getVisit(db, params.desde);
    if (source) initial = assignVisitNumber(blankVisit(prefillFromVisit(source)), briefs, false);
  }
  return (
    <div className="page">
      <PageHeader eyebrow="Hospitality" title="Nueva visita" description="El mismo recorrido del reporte de visita: datos, calibración, equipo, capacitación y cierre." />
      <VisitWizard points={points} briefs={briefs} initial={initial} editing={false} resumeDraft={!params.desde} />
    </div>
  );
}
