import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicVerification } from "@/lib/legal/verify";
import { getDb } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Certificado" };

const STATUS: Record<string, string> = {
  in_progress: "En curso",
  completed: "Completada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  pending: "Pendiente",
};

export default async function CertificatePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const record = await publicVerification(await getDb(), publicId);
  if (!record) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
      <PageHeader eyebrow={record.code ?? "Sobre"} title={record.title} description={STATUS[record.status] ?? record.status} />
      <Card>
        <CardHeader title="Huellas" description={record.chainIntact ? "La cadena de auditoría está intacta." : "La cadena de auditoría no coincide."} />
        <CardBody className="space-y-2 break-all text-xs text-ink-2">
          <p>Original: {record.sourceSha256}</p>
          <p>Final: {record.finalSha256 || "Aún no hay PDF final."}</p>
          {record.completedAt && <p>Cerrado: {record.completedAt}</p>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Firmantes" />
        <ul className="divide-y divide-line-2">
          {record.steps.map((step) => (
            <li key={step.order} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{step.order}. {step.name}</span>
              <span className="text-xs text-ink-3">{step.status}{step.signedAt ? ` · ${step.signedAt.slice(0, 16).replace("T", " ")}` : ""}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm">
        <Link className="text-navy-2 underline" href="/verificar">Comprobar otro archivo</Link>
      </p>
    </div>
  );
}
