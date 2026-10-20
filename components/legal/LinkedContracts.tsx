"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { statusLabel, statusTone } from "@/components/legal/labels";
import { cn } from "@/lib/utils";

type Item = { id: number; code: string | null; title: string; status: string; type: string };

export function LinkedContracts({ targetType, targetKey, canUpload }: { targetType: "lead" | "equipment"; targetKey: string; canUpload: boolean }) {
  const [contracts, setContracts] = useState<Item[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/legal/linked?type=${targetType}&key=${encodeURIComponent(targetKey)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { contracts?: Item[] } | null) => {
        if (!cancelled) setContracts(body?.contracts ?? []);
      })
      .catch(() => {
        if (!cancelled) setContracts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [targetType, targetKey]);

  const href = targetType === "lead" ? `/legal/nuevo?lead=${encodeURIComponent(targetKey)}` : `/legal/nuevo?equipo=${encodeURIComponent(targetKey)}`;

  return (
    <Card>
      <CardHeader
        title="Contratos"
        description="Documentos vinculados a este registro."
        actions={canUpload ? <Link href={href} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>Subir contrato</Link> : undefined}
      />
      {contracts == null ? (
        <CardBody><p className="text-sm text-ink-3">Cargando contratos…</p></CardBody>
      ) : contracts.length === 0 ? (
        <EmptyState compact icon={<FileText />} title="Sin contratos vinculados" description="El PDF se sube en Contratos y se enlaza desde aquí." />
      ) : (
        <ul className="divide-y divide-line-2">
          {contracts.map((contract) => (
            <li key={contract.id}>
              <Link href={`/legal/contratos/${contract.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{contract.title}</span>
                  <span className="text-xs text-ink-3">{contract.code}</span>
                </span>
                <Badge tone={statusTone(contract.status)} size="sm">{statusLabel(contract.status)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
