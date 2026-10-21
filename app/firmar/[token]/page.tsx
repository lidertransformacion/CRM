import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HttpError } from "@/lib/auth/users";
import { publicEnvelope } from "@/lib/legal/signatures";
import { getDb } from "@/lib/db";
import { SignDesk } from "@/components/legal/SignDesk";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Firmar" };

export default async function PublicSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const envelope = await publicEnvelope(await getDb(), token);
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <PageHeader eyebrow="Libertario" title="Firma del cliente" description="No necesitas una cuenta. El código llega al correo de esta invitación." />
        <SignDesk
          endpoint={`/api/firma/${token}`}
          title={envelope.title}
          code={envelope.code}
          status={envelope.status}
          canAct={envelope.canAct}
          steps={envelope.steps}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
