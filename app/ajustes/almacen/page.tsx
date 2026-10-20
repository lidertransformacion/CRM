import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { readUsage } from "@/lib/storage/quota";
import { getDb } from "@/lib/db";
import { RecalculateStorage } from "@/components/storage/RecalculateStorage";
import { StorageBar } from "@/components/storage/StorageBar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Almacén" };

export default async function StorageAdminPage() {
  const session = await requirePageUser("/ajustes/almacen");
  if (!can(session.role, "manage_users")) {
    return (
      <div className="page">
        <PageHeader eyebrow="Administración" title="Almacén" description="El cupo de archivos del CRM." />
        <Card>
          <EmptyState icon={<Lock />} title="Solo para administradores" description="Pide a un administrador que recalcule el uso del almacén." />
        </Card>
      </div>
    );
  }
  const usage = await readUsage(await getDb());
  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Almacén"
        description="El CRM guarda como máximo 10 GB entre contratos, adjuntos de correo y fotos de visitas. El recálculo lista los objetos en R2 y corrige el contador."
        actions={<Link href="/ajustes" className={cn(buttonVariants({ variant: "secondary" }))}>Usuarios</Link>}
      />
      <Card>
        <CardHeader title="Uso" description="Aviso a partir del 80% y de nuevo al 95%." />
        <CardBody className="space-y-4">
          <StorageBar bytesUsed={usage.bytesUsed} limitBytes={usage.limitBytes} />
          <RecalculateStorage />
        </CardBody>
      </Card>
    </div>
  );
}
