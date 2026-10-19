"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderTemplate, type EmailTemplate } from "@/lib/emails/templates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { DraftEditor } from "@/components/emails/DraftEditor";
import { OutboxPanel } from "@/components/emails/OutboxPanel";
import { LeadPicker, type LeadMode } from "@/components/emails/LeadPicker";
import { StepHeader } from "@/components/emails/StepHeader";
import { TemplatePicker } from "@/components/emails/TemplatePicker";
import { buildFields, toDraftFields, usedFieldKeys, type LeadSummary } from "@/components/emails/fields";

/**
 * Pantalla de correos en tres pasos: plantilla → oportunidad → borrador.
 * Copiar sigue en el navegador. Encolar deja el mensaje en la bandeja del servidor.
 */
export function Drafts({
  templates,
  initialTemplateId,
  initialLead,
  missingLeadKey,
  fromLabel,
}: {
  templates: EmailTemplate[];
  initialTemplateId: string | null;
  initialLead: LeadSummary | null;
  missingLeadKey: string | null;
  fromLabel: string;
}) {
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState(initialTemplateId ?? templates[0]?.id ?? "");
  const [lead, setLead] = useState<LeadSummary | null>(initialLead);
  const [mode, setMode] = useState<LeadMode>(initialLead ? "chosen" : "search");
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);
  const warnedMissing = useRef(false);
  const touched = useRef(false);
  const [recipient, setRecipient] = useState("");
  const [resend, setResend] = useState(false);
  const [enqueuePending, setEnqueuePending] = useState(false);
  const [outboxRefresh, setOutboxRefresh] = useState(0);

  const template = templates.find((item) => item.id === templateId) ?? templates[0];
  const fields = useMemo(() => buildFields(lead), [lead]);
  const usedKeys = useMemo(() => (template ? usedFieldKeys(template) : []), [template]);
  const rendered = useMemo(() => (template ? renderTemplate(template, toDraftFields(fields)) : { subject: "", body: "" }), [template, fields]);

  const subject = subjectOverride ?? rendered.subject;
  const body = bodyOverride ?? rendered.body;
  const edited = subject !== rendered.subject || body !== rendered.body;

  // Aviso único si el enlace traía una oportunidad que ya no existe en el export.
  useEffect(() => {
    if (!missingLeadKey || warnedMissing.current) return;
    warnedMissing.current = true;
    toast({ title: "No encontramos esa oportunidad", description: "El enlace apuntaba a una oportunidad que no está en el export. Búscala por nombre en el paso 2.", tone: "warn" });
  }, [missingLeadKey, toast]);

  // Mantiene el deep link al día (solo después de que el usuario eligió algo) para poder compartir la URL.
  useEffect(() => {
    if (!touched.current) return;
    const url = new URL(window.location.href);
    if (lead) url.searchParams.set("lead", lead.import_key);
    else url.searchParams.delete("lead");
    if (templateId) url.searchParams.set("plantilla", templateId);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [lead, templateId]);

  function resetDraft(reason?: string) {
    if (edited && reason) toast({ title: "Borrador armado de nuevo", description: reason, tone: "info" });
    setSubjectOverride(null);
    setBodyOverride(null);
  }

  function chooseTemplate(id: string) {
    if (id === templateId) return;
    touched.current = true;
    setTemplateId(id);
    resetDraft("Cambiaste la plantilla, así que se descartaron tus cambios.");
  }

  function chooseLead(next: LeadSummary) {
    touched.current = true;
    setLead(next);
    setMode("chosen");
    resetDraft("Cambiaste la oportunidad, así que se rellenaron los datos otra vez.");
  }

  function chooseGeneric() {
    touched.current = true;
    setLead(null);
    setMode("generic");
    resetDraft("Ahora el borrador usa texto genérico.");
  }

  async function enqueue() {
    setEnqueuePending(true);
    try {
      const response = await fetch("/api/correos/outbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject,
          body,
          dedupeKey: `${template?.id ?? "borrador"}:${lead?.import_key ?? "generico"}:${recipient.trim().toLowerCase()}`,
          resend,
        }),
      });
      const payload = (await response.json()) as { error?: string; deduped?: boolean; status?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo encolar.");
      toast({
        title: payload.deduped ? "Ya estaba en la bandeja" : "Encolado",
        description: payload.deduped ? "Marca “Volver a encolar” si quieres otro envío." : "Procesa la bandeja para registrarlo o enviarlo.",
        tone: payload.deduped ? "info" : "ok",
      });
      setOutboxRefresh((value) => value + 1);
    } catch (error) {
      toast({ title: "No se pudo encolar", description: error instanceof Error ? error.message : "Error", tone: "danger" });
    } finally {
      setEnqueuePending(false);
    }
  }

  async function copy(text: string, title: string, description: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title, description });
    } catch {
      toast({ title: "No se pudo copiar", description: "Selecciona el texto del borrador y cópialo con Ctrl+C o Cmd+C.", tone: "danger" });
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Comercial" title="Correos" description="Elige una plantilla y una oportunidad. Puedes copiar el borrador o encolarlo. Con el modo registro, procesar no llama a Gmail." />

      {templates.length === 0 ? (
        <Card>
          <EmptyState title="No hay plantillas" description="Las plantillas se cargan en la base al iniciar el CRM. Reinicia el servidor o importa los datos de nuevo." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader title={<StepHeader step={1} title="Plantilla" hint="El asunto de ejemplo muestra entre corchetes lo que se rellena." done />}  />
              <CardBody>
                <TemplatePicker templates={templates} value={template?.id ?? ""} onChange={chooseTemplate} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={<StepHeader step={2} title="Oportunidad" hint="Rellena cliente, vendedor, etapa e ingreso." done={!!lead || mode === "generic"} />}  />
              <CardBody>
                <LeadPicker mode={mode} lead={lead} onChoose={chooseLead} onGeneric={chooseGeneric} onChange={() => setMode("search")} onKeep={() => setMode("chosen")} />
              </CardBody>
            </Card>
          </div>
          <DraftEditor
            subject={subject}
            body={body}
            edited={edited}
            fields={fields}
            usedKeys={usedKeys}
            fromLabel={fromLabel}
            recipient={recipient}
            resend={resend}
            enqueuePending={enqueuePending}
            onSubjectChange={setSubjectOverride}
            onBodyChange={setBodyOverride}
            onRecipientChange={setRecipient}
            onResendChange={setResend}
            onReset={() => resetDraft()}
            onCopyAll={() => void copy(`Asunto: ${subject}\n\n${body}`, "Borrador copiado", "Pégalo en Outlook o Gmail.")}
            onCopySubject={() => void copy(subject, "Asunto copiado", "Pégalo en el campo Asunto de tu correo.")}
            onEnqueue={() => void enqueue()}
          />
        </div>
      )}
      <div className="mt-4">
        <OutboxPanel refreshKey={outboxRefresh} />
      </div>
    </div>
  );
}
