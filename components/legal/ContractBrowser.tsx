"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { statusLabel, statusTone, typeLabel } from "@/components/legal/labels";
import type { ContractRow } from "@/lib/legal/contracts";
import { cn } from "@/lib/utils";

type Row = ContractRow & { expiring: boolean };

function matches(query: string, row: Row): boolean {
  const q = query.trim().replace(/[%_]/g, "").toLowerCase();
  if (!q) return true;
  return [row.title, row.code, row.counterparty_name].some((value) => (value ?? "").toLowerCase().includes(q));
}

/** Title, client, and expiry filters run on the contracts already loaded. */
export function ContractBrowser({
  rows,
  initialQuery,
  initialExpiring,
  upload,
  manageFiles,
}: {
  rows: Row[];
  initialQuery: string;
  initialExpiring: boolean;
  upload: boolean;
  manageFiles: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const [onlyExpiring, setOnlyExpiring] = useState(initialExpiring);
  const matched = useMemo(() => rows.filter((row) => matches(query, row)).slice(0, 200), [rows, query]);
  const expiring = matched.filter((row) => row.expiring).length;
  const contracts = onlyExpiring ? matched.filter((row) => row.expiring) : matched;

  function remember(nextQuery: string, expiringOnly: boolean) {
    setQuery(nextQuery);
    setDraft(nextQuery);
    setOnlyExpiring(expiringOnly);
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    if (expiringOnly) params.set("vencer", "1");
    const text = params.toString();
    window.history.replaceState(null, "", text ? `/legal?${text}` : "/legal");
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Legal"
        title="Contratos"
        description="Todos pueden consultarlos. El vencimiento es la fecha de fin del contrato. Quien tiene Archivos en su menú organiza las carpetas."
        actions={
          <>
            {manageFiles && (
              <Link href="/legal/drive" className={cn(buttonVariants({ variant: "secondary" }))}>
                <FolderOpen /> Archivos
              </Link>
            )}
            {upload && (
              <Link href="/legal/nuevo" className={cn(buttonVariants())}>
                Subir contrato
              </Link>
            )}
          </>
        }
      />
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          remember(draft, onlyExpiring);
        }}
      >
        <input
          name="q"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Buscar por título, código o cliente"
          aria-label="Buscar contratos"
          className="h-10 min-w-[220px] flex-1 rounded-md border border-line bg-surface px-3 text-sm"
        />
        <button className={cn(buttonVariants({ variant: "secondary" }))} type="submit">
          Buscar
        </button>
        <button
          type="button"
          className={cn(buttonVariants({ variant: onlyExpiring ? "primary" : "secondary" }))}
          onClick={() => remember("", !onlyExpiring)}
        >
          Por vencer{expiring ? ` (${expiring})` : ""}
        </button>
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
                  <span className="text-xs text-ink-3">
                    {contract.code} · {typeLabel(contract.type)}
                    {contract.counterparty_name ? ` · ${contract.counterparty_name}` : ""}
                    {contract.end_date ? ` · vence ${contract.end_date}` : ""}
                  </span>
                </span>
                <span className="flex gap-2">
                  {contract.expiring && (
                    <Badge tone="warn" size="sm">
                      Por vencer
                    </Badge>
                  )}
                  <Badge tone={statusTone(contract.status)} size="sm">
                    {statusLabel(contract.status)}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
