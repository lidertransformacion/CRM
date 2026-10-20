"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderTemplate, type EmailTemplate } from "@/lib/emails/templates";
import { htmlToText, toEditorHtml, MAX_MAIL_BYTES } from "@/lib/mail/html";
import { TemplateEditor } from "@/components/emails/TemplateEditor";
import { deleteMailFile, uploadMailFile, type UploadedFile } from "@/components/emails/upload";
import { Button } from "@/components/ui/button";
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
  testMode = false,
}: {
  templates: EmailTemplate[];
  initialTemplateId: string | null;
  initialLead: LeadSummary | null;
  missingLeadKey: string | null;
  fromLabel: string;
  testMode?: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(templates);
  const [editingTemplate, setEditingTemplate] = useState(false);
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
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [inlineBytes, setInlineBytes] = useState(0);
  const [uploading, setUploading] = useState(false);

  const template = items.find((item) => item.id === templateId) ?? items[0];
  const fields = useMemo(() => buildFields(lead), [lead]);
  const usedKeys = useMemo(() => (template ? usedFieldKeys(template) : []), [template]);
  const rendered = useMemo(() => (template ? renderTemplate(template, toDraftFields(fields)) : { subject: "", body: "" }), [template, fields]);
  const renderedHtml = useMemo(() => toEditorHtml(rendered.body), [rendered.body]);

  const subject = subjectOverride ?? rendered.subject;
  const body = bodyOverride ?? renderedHtml;
  const edited = subject !== rendered.subject || body !== renderedHtml;
  const attachmentBytes = files.reduce((sum, file) => sum + file.size, 0) + inlineBytes;

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
          body: htmlToText(body),
          html: body,
          attachmentIds: files.map((file) => file.id),
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

  async function addFile(file: File) {
    if (attachmentBytes + file.size > MAX_MAIL_BYTES) {
      toast({ title: "El correo pasa de 20 MB", description: "Quita un archivo o usa uno más liviano. Gmail rechaza cerca de 25 MB ya codificados.", tone: "danger" });
      return;
    }
    setUploading(true);
    try {
      const saved = await uploadMailFile(file);
      setFiles((current) => [...current, saved]);
    } catch (error) {
      toast({ title: "No se pudo adjuntar", description: error instanceof Error ? error.message : "Error", tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(id: string) {
    const previous = files;
    setFiles((current) => current.filter((file) => file.id !== id));
    try {
      await deleteMailFile(id);
    } catch (error) {
      setFiles(previous);
      toast({ title: "No se pudo quitar el archivo", description: error instanceof Error ? error.message : undefined, tone: "danger" });
    }
  }

  async function copyHtml(subjectLine: string, html: string) {
    const text = `Asunto: ${subjectLine}\n\n${htmlToText(html)}`;
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast({ title: "Borrador copiado", description: "Incluye el formato." });
    } catch {
      toast({ title: "No se pudo copiar", description: "Selecciona el texto del borrador y cópialo a mano.", tone: "danger" });
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
      <PageHeader eyebrow="Comercial" title="Correos" description="Elige una plantilla y una oportunidad. Puedes copiar el borrador o encolarlo. Con el modo registro, encolar no envía el correo." />

      {items.length === 0 ? (
        <Card>
          <EmptyState title="No hay plantillas" description="Las plantillas se cargan en la base al iniciar el CRM. Reinicia el servidor o importa los datos de nuevo." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader
                title={<StepHeader step={1} title="Plantilla" hint="El asunto de ejemplo muestra entre corchetes lo que se rellena." done />}
                actions={<Button variant="secondary" size="sm" onClick={() => setEditingTemplate(true)}>Editar plantilla</Button>}
              />
              <CardBody>
                <TemplatePicker templates={items} value={template?.id ?? ""} onChange={chooseTemplate} />
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
            testMode={testMode}
            recipient={recipient}
            resend={resend}
            enqueuePending={enqueuePending}
            onSubjectChange={setSubjectOverride}
            onBodyChange={setBodyOverride}
            onRecipientChange={setRecipient}
            onResendChange={setResend}
            onReset={() => resetDraft()}
            onCopyAll={() => void copyHtml(subject, body)}
            attachments={files}
            attachmentBytes={attachmentBytes}
            attachmentPending={uploading}
            onAddAttachment={(file) => void addFile(file)}
            onRemoveAttachment={(id) => void removeFile(id)}
            onImageUploaded={(file) => setInlineBytes((current) => current + file.size)}
            onCopySubject={() => void copy(subject, "Asunto copiado", "Pégalo en el campo Asunto de tu correo.")}
            onEnqueue={() => void enqueue()}
          />
        </div>
      )}
      <div className="mt-4">
        <OutboxPanel refreshKey={outboxRefresh} />
      </div>
      <TemplateEditor
        template={template ?? null}
        open={editingTemplate}
        onOpenChange={setEditingTemplate}
        onSaved={(saved) => {
          setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
          setSubjectOverride(null);
          setBodyOverride(null);
          toast({ title: "Plantilla guardada", description: saved.name });
        }}
      />
    </div>
  );
}
