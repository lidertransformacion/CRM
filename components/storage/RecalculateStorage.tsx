"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatGb } from "@/lib/storage/format";

type Bucket = { binding: string; label: string; bytes: number; objects: number };

export function RecalculateStorage() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);

  async function recalculate() {
    setPending(true);
    try {
      const response = await fetch("/api/storage/recalculate", { method: "POST" });
      const body = (await response.json()) as { error?: string; bytesUsed?: number; buckets?: Bucket[] };
      if (!response.ok) {
        toast({ title: "No se pudo recalcular", description: body.error, tone: "danger" });
        return;
      }
      setBuckets(body.buckets ?? []);
      toast({ title: "Uso recalculado", description: formatGb(body.bytesUsed ?? 0), tone: "ok" });
      router.refresh();
    } catch {
      toast({ title: "Sin conexión", description: "Inténtalo de nuevo.", tone: "danger" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" loading={pending} onClick={() => void recalculate()}>
        Recalcular desde el almacén
      </Button>
      {buckets && (
        <ul className="space-y-1 text-sm text-ink-2">
          {buckets.length === 0 && <li>No hay almacenes conectados.</li>}
          {buckets.map((bucket) => (
            <li key={bucket.binding}>
              {bucket.label}: {formatGb(bucket.bytes)} ({bucket.objects} {bucket.objects === 1 ? "archivo" : "archivos"})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
