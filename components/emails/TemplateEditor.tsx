"use client";

import { useEffect, useState } from "react";
import type { EmailTemplate } from "@/lib/emails/templates";
import { toEditorHtml } from "@/lib/mail/html";
import { RichTextEditor } from "@/components/emails/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function TemplateEditor({
  template,
  open,
  onOpenChange,
  onSaved,
}: {
  template: EmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (template: EmailTemplate) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("<p></p>");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !template) return;
    setSubject(template.subject);
    setBody(toEditorHtml(template.body));
    setError("");
  }, [open, template]);

  async function save() {
    if (!template) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/correos/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const payload = (await response.json()) as { template?: EmailTemplate; error?: string };
      if (!response.ok || !payload.template) throw new Error(payload.error || "No se pudo guardar.");
      onSaved(payload.template);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={template ? `Editar ${template.name}` : "Editar plantilla"} description="Las llaves {{cliente}} se rellenan al armar el borrador. El formato se guarda para todo el equipo.">
        <DialogBody className="space-y-3">
          <Field label="Asunto" htmlFor="template-subject" required>
            <Input id="template-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field label="Cuerpo" htmlFor="template-body">
            <RichTextEditor id="template-body" value={body} onChange={setBody} />
          </Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} loading={pending} disabled={!subject.trim()}>Guardar plantilla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
