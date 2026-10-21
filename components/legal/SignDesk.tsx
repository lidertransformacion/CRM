"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SignatureCanvas } from "@/components/legal/SignatureCanvas";

type StepView = { order: number; roleLabel: string; name: string; email: string; status: string; signedAt: string | null };

const STATUS: Record<string, string> = {
  waiting: "En espera",
  active: "En turno",
  signed: "Firmó",
  rejected: "Rechazó",
  skipped: "Omitido",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  pending: "Pendiente",
};

export function SignDesk({
  endpoint,
  title,
  code,
  status,
  canAct,
  steps,
}: {
  endpoint: string;
  title: string;
  code: string | null;
  status: string;
  canAct: boolean;
  steps: StepView[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [typed, setTyped] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function post(body: Record<string, unknown>, ok: string) {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast({ title: "No se pudo firmar", description: payload?.error || "Inténtalo de nuevo.", tone: "danger" });
        return;
      }
      toast({ title: ok, tone: "ok" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader eyebrow={code ?? "Contrato"} title={title} description={`Estado: ${STATUS[status] ?? status}`} />
        <CardBody>
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.order} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {step.order}. {step.roleLabel} · {step.name}
                  <span className="block text-xs text-ink-3">{step.email}</span>
                </span>
                <span className="text-xs text-ink-3">{STATUS[step.status] ?? step.status}</span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      {canAct && (
        <Card>
          <CardHeader title="Firmar" description="Dibuja o escribe tu nombre, acepta y usa el código que llega a tu correo." />
          <CardBody className="space-y-4">
            <SignatureCanvas onChange={setPng} />
            <Field label="O escribe tu nombre" htmlFor="typed-sign">
              <Input id="typed-sign" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Nombre y apellido" />
            </Field>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Acepto firmar electrónicamente este documento (Ley 527 de 1999, Decreto 2364 de 2012).</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" loading={pending} onClick={() => post({ action: "otp" }, "Te enviamos el código")}>
                Enviar código
              </Button>
              <Input aria-label="Código de 6 dígitos" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Código" className="max-w-32" />
              <Button
                type="button"
                loading={pending}
                onClick={() => post({ action: "sign", otp, consent, typedName: typed, signaturePng: png }, "Firma registrada")}
              >
                Firmar
              </Button>
            </div>
            <Field label="Si no estás de acuerdo, escribe el motivo" htmlFor="reject-reason">
              <Input id="reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <Button type="button" variant="danger-soft" loading={pending} onClick={() => post({ action: "reject", reason }, "Rechazaste la firma")}>
              Rechazar
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
