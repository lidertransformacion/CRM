"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function SignatureActions({
  contractId,
  requestId,
  status,
  canSend,
}: {
  contractId: number;
  requestId: number | null;
  status: string | null;
  canSend: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const open = status === "in_progress" || status === "pending";

  async function post(action: "send" | "cancel") {
    setPending(true);
    try {
      const response = await fetch(`/api/legal/contracts/${contractId}/firma`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; requestId?: number } | null;
      if (!response.ok) {
        toast({ title: "No se pudo", description: payload?.error || "Inténtalo de nuevo.", tone: "danger" });
        return;
      }
      toast({ title: action === "send" ? "Enviado a firma" : "Firma cancelada", tone: "ok" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Firma electrónica" description="El orden es el de los firmantes. Solo firma quien está en turno. El correo de prueba no sale del remitente." />
      <CardBody className="flex flex-wrap items-center gap-2">
        {canSend && !open && (
          <Button type="button" loading={pending} onClick={() => post("send")}>
            Enviar a firma
          </Button>
        )}
        {open && requestId && (
          <Button type="button" variant="secondary" asChild>
            <Link href={`/firmas/${requestId}`}>Abrir firma</Link>
          </Button>
        )}
        {open && canSend && (
          <Button type="button" variant="danger-soft" loading={pending} onClick={() => post("cancel")}>
            Cancelar firma
          </Button>
        )}
        {status === "completed" && <p className="text-sm text-ink-2">Este contrato ya se firmó.</p>}
        {status === "rejected" && <p className="text-sm text-ink-2">La última firma se rechazó. El contrato volvió a borrador.</p>}
        {!status && !canSend && <p className="text-sm text-ink-3">Todavía no se ha enviado a firma.</p>}
      </CardBody>
    </Card>
  );
}
