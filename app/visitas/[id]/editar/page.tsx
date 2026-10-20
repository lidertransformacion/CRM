import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VisitWizard } from "@/components/visits/VisitWizard";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db";
import { ensureVisitPoints, getVisit, listPoints, listVisitBriefs } from "@/lib/visits/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar visita" };

export default async function EditarVisitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await ensureVisitPoints(db);
  const [visit, points, briefs] = await Promise.all([getVisit(db, id), listPoints(db), listVisitBriefs(db)]);
  if (!visit) notFound();
  return (
    <div className="page">
      <PageHeader eyebrow="Hospitality" title="Editar visita" description={visit.cliente || "Borrador"} />
      <VisitWizard points={points} briefs={briefs} initial={visit} editing />
    </div>
  );
}
