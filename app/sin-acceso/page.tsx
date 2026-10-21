import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/page-session";
import { LinkButton } from "@/components/home/LinkButton";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sin acceso" };

export default async function DeniedPage() {
  await requirePageUser("/sin-acceso");
  return (
    <div className="page">
      <PageHeader eyebrow="Acceso" title="Sin acceso" description="Esa sección no está en tu rol." />
      <Card>
        <EmptyState title="No tienes acceso a esa sección" description="El menú muestra solo lo que puedes abrir. Si necesitas otra cosa, pídesela a administración." action={<LinkButton href="/">Volver al inicio</LinkButton>} />
      </Card>
    </div>
  );
}
