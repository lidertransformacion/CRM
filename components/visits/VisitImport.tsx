"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

/** Pastes one or more LIBV1 codes from WhatsApp and stores the visits. */
export function VisitImport() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      const response = await fetch("/api/visits/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json()) as { error?: string; added?: number; updated?: number; bad?: number };
      if (!response.ok) {
        toast({ title: "No se pudo importar", description: body.error, tone: "danger" });
        return;
      }
      const parts = [
        body.added ? `${body.added} agregada${body.added === 1 ? "" : "s"}` : "",
        body.updated ? `${body.updated} actualizada${body.updated === 1 ? "" : "s"}` : "",
        body.bad ? `${body.bad} incompleta${body.bad === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      toast({ title: parts.join(" · ") || "Sin cambios", tone: body.bad ? "warn" : "ok" });
      if (!body.bad) setText("");
      router.refresh();
    } catch {
      toast({ title: "Sin conexión", tone: "danger" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
          Pegar registro LIBV1
        </Button>
        <Button type="button" variant="secondary" onClick={() => { window.location.href = "/api/visits/export"; }}>
          Exportar CSV
        </Button>
      </div>
      {open && (
        <div className="space-y-2 rounded-lg border border-line-2 bg-surface p-4">
          <label htmlFor="libv1" className="text-xs font-medium text-ink-2">
            Pega el mensaje completo o solo la línea que empieza por LIBV1. Puedes pegar varios.
          </label>
          <Textarea id="libv1" value={text} onChange={(event) => setText(event.target.value)} className="min-h-28" />
          <Button type="button" loading={pending} disabled={pending || !text.trim()} onClick={() => void submit()}>
            Agregar al historial
          </Button>
        </div>
      )}
    </div>
  );
}
