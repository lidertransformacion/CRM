import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { DriveDesk } from "@/components/legal/DriveDesk";
import { readUsage } from "@/lib/storage/quota";
import { getDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archivos" };

export default async function DrivePage() {
  const session = await requirePageUser("/legal/drive");
  const manage = can(session.role, "manage_files");
  const usage = await readUsage(await getDb());
  return (
    <div className="page">
      <PageHeader
        eyebrow="Legal"
        title="Archivos"
        description={manage ? "Carpetas, PDF y vista previa. El archivo vive en el CRM, no en Google Drive." : "Puedes consultar y descargar. Legal y administración crean carpetas y suben archivos sueltos."}
        actions={<Link href="/legal" className={cn(buttonVariants({ variant: "secondary" }))}>Contratos</Link>}
      />
      <DriveDesk canManage={manage} initialUsage={{ bytesUsed: usage.bytesUsed, limitBytes: usage.limitBytes }} />
    </div>
  );
}
