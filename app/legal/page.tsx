import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { listContracts } from "@/lib/legal/contracts";
import { getDb } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { statusLabel, statusTone, typeLabel } from "@/components/legal/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contratos" };

export default async function LegalHome({ searchParams }: { searchParams: Promise<{ q?: string; vencer?: string }> }) {
  const session = await requirePageUser("/legal");
  const params = await searchParams;
  const query = params.q ?? "";
  const onlyExpiring = params.vencer === "1";
  const rows = await listContracts(await getDb(), { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null }, query);
  const contracts = onlyExpiring ? rows.filter((row) => row.expiring) : rows;
  const expiring = rows.filter((row) => row.expiring).length;
  const upload = can(session.role, "upload_contract");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Legal"
        title="Contratos"
        description="Todos pueden consultarlos. El vencimiento es la fecha de fin del contrato. Quien tiene Archivos en su menú organiza las carpetas."
        actions={
          <>
            {can(session.role, "manage_files") && <Link href="/legal/drive" className={cn(buttonVariants({ variant: "secondary" }))}><FolderOpen /> Archivos</Link>}
            {upload && <Link href="/legal/nuevo" className={cn(buttonVariants())}>Subir contrato</Link>}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" action="/legal">
        <input name="q" defaultValue={query} placeholder="Buscar por título, código o cliente" aria-label="Buscar contratos" className="h-10 min-w-[220px] flex-1 rounded-md border border-line bg-surface px-3 text-sm" />
        {onlyExpiring && <input type="hidden" name="vencer" value="1" />}
        <button className={cn(buttonVariants({ variant: "secondary" }))} type="submit">Buscar</button>
        <Link href={onlyExpiring ? "/legal" : "/legal?vencer=1"} className={cn(buttonVariants({ variant: onlyExpiring ? "primary" : "secondary" }))}>
          Por vencer{expiring ? ` (${expiring})` : ""}
        </Link>
      </form>
      {contracts.length === 0 ? (
        <Card>
          <EmptyState title="No hay contratos" description={upload ? "Sube el primer PDF, firmado o sin firmar." : "Cuando Legal o Comercial suban un contrato, aparecerá aquí."} />
        </Card>
      ) : (
        <ul className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line-2 bg-surface">
          {contracts.map((contract) => (
            <li key={contract.id}>
              <Link href={`/legal/contratos/${contract.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent-soft">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{contract.title}</span>
                  <span className="text-xs text-ink-3">{contract.code} · {typeLabel(contract.type)}{contract.counterparty_name ? ` · ${contract.counterparty_name}` : ""}{contract.end_date ? ` · vence ${contract.end_date}` : ""}</span>
                </span>
                <span className="flex gap-2">
                  {contract.expiring && <Badge tone="warn" size="sm">Por vencer</Badge>}
                  <Badge tone={statusTone(contract.status)} size="sm">{statusLabel(contract.status)}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
