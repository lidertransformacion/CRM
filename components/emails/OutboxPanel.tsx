"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type OutboxMessage = {
  id: number;
  to: string;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  provider: string | null;
  createdAt: string;
  sentAt: string | null;
};

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  queued: { label: "En cola", tone: "info" },
  sending: { label: "Enviando", tone: "warn" },
  sent: { label: "Enviado", tone: "ok" },
  failed: { label: "Falló", tone: "danger" },
  skipped: { label: "Omitido", tone: "neutral" },
};

export function OutboxPanel({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [mode, setMode] = useState<string>("log");
  const [testMode, setTestMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/correos/outbox");
    if (!response.ok) throw new Error("No se pudo leer la bandeja.");
    const body = (await response.json()) as { messages: OutboxMessage[]; mode: string; testMode?: boolean };
    setMessages(body.messages);
    setMode(body.mode);
    setTestMode(body.testMode !== false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((error: unknown) => {
        if (!cancelled) toast({ title: "Bandeja", description: error instanceof Error ? error.message : "No se pudo leer.", tone: "danger" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey, toast]);

  async function processQueue() {
    setProcessing(true);
    try {
      const response = await fetch("/api/correos/outbox/process", { method: "POST" });
      const body = (await response.json()) as { error?: string; sent?: number; failed?: number; skipped?: number; queued?: number; mode?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo procesar.");
      if (body.mode) setMode(body.mode);
      toast({
        title: body.mode === "log" ? "Sigue en cola" : "Bandeja procesada",
        description:
          body.mode === "log"
            ? "El modo registro no envía. Gmail no se llamó."
            : `Enviados ${body.sent ?? 0}, en cola ${body.queued ?? 0}, fallidos ${body.failed ?? 0}, omitidos ${body.skipped ?? 0}.`,
      });
      await load();
    } catch (error) {
      toast({ title: "No se pudo procesar", description: error instanceof Error ? error.message : "Error", tone: "danger" });
    } finally {
      setProcessing(false);
    }
  }

  async function retry(id: number) {
    const response = await fetch(`/api/correos/outbox/${id}`, { method: "POST" });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast({ title: "No se pudo reintentar", description: body.error || "Error", tone: "danger" });
      return;
    }
    await load();
  }

  return (
    <Card>
      <CardHeader
        title="Bandeja de salida"
        description={
          testMode && mode !== "log"
            ? "Modo de prueba: el correo llega a tu cuenta, no al cliente."
            : mode === "log"
              ? "El modo actual es registro. Los correos quedan en cola y no se envían."
              : mode === "gmail_api"
                ? "El modo actual envía por la API de Gmail."
                : "El modo actual usa SMTP."
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void processQueue()} loading={processing} disabled={processing}>
            Procesar bandeja
          </Button>
        }
      />
      <CardBody>
        {loading ? (
          <p className="text-sm text-ink-3">Leyendo la bandeja…</p>
        ) : messages.length === 0 ? (
          <EmptyState compact title="Nada en la bandeja" description="Encola un borrador y luego procésalo." />
        ) : (
          <ul className="divide-y divide-line-2">
            {messages.slice(0, 12).map((message) => {
              const status = STATUS[message.status] ?? { label: message.status, tone: "neutral" as const };
              const logged = message.status === "sent" && message.provider === "log";
              return (
                <li key={message.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{message.subject}</p>
                    <p className="truncate text-xs text-ink-3">{message.to}</p>
                    {message.lastError && <p className="text-xs text-danger">{message.lastError}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={status.tone}>{logged ? "Registrado" : status.label}</Badge>
                    {message.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => void retry(message.id)}>
                        Reintentar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
