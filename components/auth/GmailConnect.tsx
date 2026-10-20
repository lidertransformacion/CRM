"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const MOTIVO: Record<string, string> = {
  state: "El enlace de Google caducó o no coincide. Vuelve a intentar.",
  correo: "La cuenta de Google no es el mismo correo con el que entraste al CRM.",
  dominio: "Solo se puede conectar un correo @libertariocoffee.com.",
  token: "Google no entregó permiso para enviar. Inténtalo otra vez.",
  config: "Falta la configuración de Google en el servidor.",
  denegado: "Cancelaste la conexión con Google.",
  google: "Google no aceptó la conexión.",
};

/** Conectar o desconectar el Gmail del usuario que tiene la sesión. */
export function GmailConnect({
  status,
  googleEmail,
  notice,
  motivo,
  testMode,
}: {
  status: "connected" | "disconnected";
  googleEmail: string | null;
  notice: "conectado" | "error" | null;
  motivo: string | null;
  testMode: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const connected = status === "connected";

  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("motivo");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [notice]);

  async function disconnect() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/google/disconnect", { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo desconectar.");
      toast({ title: "Gmail desconectado", description: "Esta cuenta ya no envía correos desde el CRM." });
      router.refresh();
    } catch (error) {
      toast({ title: "No se pudo desconectar", description: error instanceof Error ? error.message : "Error", tone: "danger" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader title="Gmail" description={connected ? "Los correos que envíes desde el CRM salen de esta cuenta." : "Conecta tu cuenta para que los correos del CRM salgan desde tu Gmail."} />
      <CardBody className="space-y-3">
        {notice === "conectado" && (
          <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Gmail quedó conectado. Los correos saldrán desde tu cuenta.</p>
        )}
        {notice === "error" && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{MOTIVO[motivo ?? ""] ?? MOTIVO.google}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={connected ? "ok" : "neutral"} dot>
            {connected ? "Conectado" : "Desconectado"}
          </Badge>
          {googleEmail && <span className="break-all text-sm font-medium text-ink">{googleEmail}</span>}
        </div>
        {!connected && googleEmail && (
          <p className="text-xs text-ink-3">La conexión con {googleEmail} venció. Vuelve a conectar Gmail.</p>
        )}
        {testMode && (
          <p className="text-xs text-ink-3">
            Modo de prueba activo: ningún cliente recibe el correo. Llega a tu cuenta hasta que se active el envío real.
          </p>
        )}
      </CardBody>
      <CardFooter className="justify-start">
        {connected ? (
          <Button type="button" variant="secondary" onClick={disconnect} loading={pending} disabled={pending}>
            Desconectar
          </Button>
        ) : (
          <a href="/api/auth/google" className={cn(buttonVariants({ variant: "primary" }))}>
            <Mail />
            Conectar Gmail
          </a>
        )}
      </CardFooter>
    </Card>
  );
}
