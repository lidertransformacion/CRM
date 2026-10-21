import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-session";
import { HttpError } from "@/lib/auth/users";
import { envelopeForUser } from "@/lib/legal/signatures";
import { getDb } from "@/lib/db";
import { SignDesk } from "@/components/legal/SignDesk";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Firmar" };

export default async function FirmaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageUser("/firmas");
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) notFound();
  try {
    const envelope = await envelopeForUser(await getDb(), {
      uid: session.uid,
      email: session.email,
      role: session.role,
      ip: null,
      userAgent: null,
    }, numeric);
    return (
      <div className="page">
        <PageHeader eyebrow="Firma" title={envelope.contract.title} description="Revisa el orden y, si es tu turno, firma con el código del correo." />
        <SignDesk
          endpoint={`/api/firmas/${numeric}`}
          title={envelope.contract.title}
          code={envelope.contract.code}
          status={envelope.request.status}
          canAct={envelope.canAct}
          steps={envelope.steps}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}
