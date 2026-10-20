"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { COMMERCIALS, RESULT, WHATSAPP_DESTINATION, matchTeam } from "@/lib/visits/catalog";
import { emailDraft, emailText, longDate, mailSigner, reportNumber, reportSections, whatsAppLink, whatsAppText } from "@/lib/visits/calc";
import { encodeVisitCode } from "@/lib/visits/codec";
import type { VisitRecord } from "@/lib/visits/model";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** Saved visit: client report, PDF, the commercial's email, and the WhatsApp code. */
export function VisitReport({ visit, testMode }: { visit: VisitRecord; testMode: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [signer, setSigner] = useState(mailSigner(visit).id);
  const [to, setTo] = useState("");
  const [body, setBody] = useState(() => emailText({ ...visit, mailSigner: mailSigner(visit).id }));
  const [pending, setPending] = useState(false);
  const signed = { ...visit, mailSigner: signer };
  const subject = emailDraft(signed).subject;
  const result = visit.resultadoFinal && visit.resultadoFinal in RESULT ? RESULT[visit.resultadoFinal as keyof typeof RESULT] : null;
  const sections = reportSections(visit, "team");
  const assigned = matchTeam(visit.planCli?.com || "");

  function chooseSigner(id: string) {
    setSigner(id);
    setBody(emailText({ ...visit, mailSigner: id }));
  }

  async function shareWhatsApp() {
    try {
      const code = await encodeVisitCode(visit);
      const message = whatsAppText(visit, code);
      const ok = await copyText(message);
      toast({ title: ok ? "Mensaje copiado" : "Copia el mensaje a mano", description: `WhatsApp ${formatPhone(WHATSAPP_DESTINATION)}`, tone: "ok" });
      window.open(whatsAppLink(message), "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Este navegador no pudo armar el código LIBV1", tone: "danger" });
    }
  }

  async function queueEmail() {
    setPending(true);
    try {
      const response = await fetch(`/api/visits/${visit.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const payload = (await response.json()) as { error?: string; testMode?: boolean; deduped?: boolean };
      if (!response.ok) {
        toast({ title: "No se encoló", description: payload.error, tone: "danger" });
        return;
      }
      toast({
        title: payload.deduped ? "Ese correo ya estaba en la bandeja" : "Correo encolado",
        description: payload.testMode !== false ? "Modo de prueba: no sale al cliente. Lo recibe quien envía." : "Se procesará con la bandeja de correos.",
        tone: "ok",
      });
    } catch {
      toast({ title: "Sin conexión", tone: "danger" });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm("¿Eliminar esta visita del historial? Esta acción no se puede deshacer.")) return;
    const response = await fetch(`/api/visits/${visit.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast({ title: "No se pudo eliminar", tone: "danger" });
      return;
    }
    router.push("/visitas");
    router.refresh();
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button type="button" onClick={() => { window.location.href = `/api/visits/${visit.id}/pdf`; }}>
          Descargar PDF
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button type="button" variant="secondary" onClick={() => void shareWhatsApp()}>
          Copiar para WhatsApp
        </Button>
        <Button variant="secondary" asChild>
          <Link href={`/visitas/${visit.id}/editar`}>Editar</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href={`/visitas/nueva?desde=${visit.id}`}>Nueva visita a este cliente</Link>
        </Button>
        <Button type="button" variant="danger-soft" onClick={() => void remove()}>
          Eliminar
        </Button>
      </div>
      <Card className="print:border-0 print:shadow-none">
        <CardHeader eyebrow="Libertario Hospitality" title={visit.cliente || "Visita"} description={`${reportNumber(visit)} · ${longDate(visit.fecha)}`} />
        <CardBody className="space-y-5">
          {result && <p className="text-sm font-medium text-ink">{result.name}. {result.detail}</p>}
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="font-sans text-sm font-semibold text-ink">{section.title}</h3>
              <ul className="mt-1 space-y-1 text-sm text-ink-2">
                {section.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
          {visit.fotos.some((photo) => photo.src) && (
            <section>
              <h3 className="font-sans text-sm font-semibold text-ink">Fotos</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {visit.fotos.filter((photo) => photo.src).map((photo, index) => (
                  <figure key={index}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.src} alt={photo.tag || `Foto ${index + 1}`} className="aspect-[4/3] w-full rounded-md object-cover" />
                    <figcaption className="mt-1 text-xs text-ink-3">{photo.tag}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {visit.firmaBarista && (
              <figure>
                <figcaption className="text-xs text-ink-3">Firma de quien visitó</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={visit.firmaBarista} alt="Firma de quien visitó" className="mt-1 h-24 w-full rounded-md border border-line object-contain" />
              </figure>
            )}
            {visit.firmaCliente && (
              <figure>
                <figcaption className="text-xs text-ink-3">Firma de quien recibe</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={visit.firmaCliente} alt="Firma de quien recibe" className="mt-1 h-24 w-full rounded-md border border-line object-contain" />
              </figure>
            )}
          </div>
        </CardBody>
      </Card>
      <Card className="print:hidden">
        <CardHeader title="Correo para el cliente" description="Lo firma el comercial de la cuenta. El envío pasa por la bandeja y respeta el modo de prueba." />
        <CardBody className="space-y-3">
          {testMode && <p className="rounded-md bg-amarillo px-3 py-2 text-sm text-ink">Modo de prueba activo. Aunque encoles el correo, no se entrega al cliente: lo recibe la cuenta que envía.</p>}
          <p className="text-xs text-ink-3">{assigned && assigned.role === "Comercial" ? `Asignado a este cliente: ${assigned.name}` : "Este cliente no tiene comercial asignado"}</p>
          <div className="flex flex-wrap gap-2">
            {COMMERCIALS.map((member) => (
              <Chip key={member.id} active={signer === member.id} onClick={() => chooseSigner(member.id)}>
                {member.name}
              </Chip>
            ))}
          </div>
          <Field label="Asunto" htmlFor="asunto">
            <div className="flex gap-2">
              <Input id="asunto" readOnly value={subject} />
              <Button type="button" variant="secondary" onClick={() => void copyText(subject).then((ok) => toast({ title: ok ? "Asunto copiado" : "No se pudo copiar", tone: ok ? "ok" : "warn" }))}>
                Copiar
              </Button>
            </div>
          </Field>
          <Field label="Cuerpo" htmlFor="cuerpo" hint="Puedes editarlo antes de copiar o encolar">
            <Textarea id="cuerpo" className="min-h-64" value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <Button type="button" variant="secondary" onClick={() => void copyText(body).then((ok) => toast({ title: ok ? "Correo copiado" : "Selecciona el texto para copiarlo", tone: ok ? "ok" : "warn" }))}>
            Copiar correo
          </Button>
          <Field label="Correo del cliente" htmlFor="para" hint="Opcional. Encola el envío por el módulo de correos">
            <Input id="para" type="email" inputMode="email" value={to} placeholder="cliente@empresa.com" onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button type="button" loading={pending} disabled={pending || !to.trim()} onClick={() => void queueEmail()}>
            Encolar envío
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function formatPhone(digits: string): string {
  return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}
