import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VisitReport } from "@/components/visits/VisitReport";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db";
import { mailTestMode } from "@/lib/mail/message";
import { reportNumber } from "@/lib/visits/calc";
import { getVisit } from "@/lib/visits/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reporte de visita" };

export default async function VisitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const visit = await getVisit(db, id);
  if (!visit) notFound();
  return (
    <div className="page">
      <PageHeader
        eyebrow="Hospitality"
        title={visit.cliente || "Reporte"}
        description={reportNumber(visit)}
        actions={
          <Button variant="secondary" asChild className="print:hidden">
            <Link href="/visitas">Volver al historial</Link>
          </Button>
        }
      />
      <VisitReport visit={visit} testMode={await mailTestMode()} />
    </div>
  );
}
