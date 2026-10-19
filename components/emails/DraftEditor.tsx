"use client";

import { Copy, RotateCcw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { StepHeader } from "@/components/emails/StepHeader";
import type { FieldKey, ResolvedField } from "@/components/emails/fields";

/** Paso 3: asunto y cuerpo editables. Copiar sigue disponible; encolar deja el correo en la bandeja. */
export function DraftEditor({
  subject,
  body,
  edited,
  fields,
  usedKeys,
  fromLabel,
  recipient,
  resend,
  enqueuePending,
  onSubjectChange,
  onBodyChange,
  onRecipientChange,
  onResendChange,
  onReset,
  onCopyAll,
  onCopySubject,
  onEnqueue,
}: {
  subject: string;
  body: string;
  edited: boolean;
  fields: ResolvedField[];
  usedKeys: FieldKey[];
  fromLabel: string;
  recipient: string;
  resend: boolean;
  enqueuePending: boolean;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onRecipientChange: (value: string) => void;
  onResendChange: (value: boolean) => void;
  onReset: () => void;
  onCopyAll: () => void;
  onCopySubject: () => void;
  onEnqueue: () => void;
}) {
  const used = fields.filter((field) => usedKeys.includes(field.key));
  const generic = used.filter((field) => field.generic).length;

  return (
    <Card className="flex min-h-full flex-col">
      <CardHeader
        title={<StepHeader step={3} title="Borrador" hint="Revisa, cópialo o encolalo en la bandeja." />}
        actions={
          edited ? (
            <>
              <Badge tone="warn" dot>Editado</Badge>
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw /> Restablecer desde la plantilla
              </Button>
            </>
          ) : undefined
        }
      />
      <CardBody className="flex-1 space-y-4">
        <Field label="Asunto" htmlFor="draft-subject">
          <Input id="draft-subject" value={subject} onChange={(event) => onSubjectChange(event.target.value)} />
        </Field>
        <Field label="Cuerpo" htmlFor="draft-body">
          <Textarea id="draft-body" value={body} onChange={(event) => onBodyChange(event.target.value)} className="min-h-[340px] font-sans max-sm:min-h-[300px]" spellCheck />
        </Field>
        <div className="rounded-lg border border-line-2 bg-surface-2 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-2">Datos usados en esta plantilla</p>
            {generic > 0 && (
              <span className="text-[11px] text-ink-3">
                {generic === 1 ? "1 dato quedó genérico" : `${generic} datos quedaron genéricos`}
              </span>
            )}
          </div>
          {used.length === 0 ? (
            <p className="mt-1 text-xs text-ink-3">Esta plantilla no usa datos de la oportunidad.</p>
          ) : (
            // Móvil: rejilla de 2 columnas con etiqueta sobre valor. Escritorio: etiqueta | valor.
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-1.5">
              {used.map((field) => (
                <FieldRow key={field.key} field={field} />
              ))}
            </dl>
          )}
        </div>
      </CardBody>
      <CardFooter className="flex-wrap max-sm:flex-col max-sm:items-stretch">
        <Button variant="secondary" onClick={onCopySubject} className="max-sm:hidden">Copiar solo el asunto</Button>
        <Button variant="link" onClick={onCopySubject} className="sm:hidden">Copiar solo el asunto</Button>
        <Button variant="secondary" onClick={onCopyAll}>
          <Copy /> Copiar borrador
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[240px] sm:max-w-xs sm:items-stretch">
          <Field label="Destinatario" htmlFor="draft-to">
            <Input id="draft-to" type="email" value={recipient} onChange={(event) => onRecipientChange(event.target.value)} placeholder="cliente@correo.com" />
          </Field>
          <p className="text-[11px] text-ink-3">Sale como {fromLabel}</p>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={resend} onChange={(event) => onResendChange(event.target.checked)} />
            Volver a encolar si ya estaba
          </label>
          <Button onClick={onEnqueue} loading={enqueuePending} disabled={enqueuePending || !recipient.trim()}>
            <Send /> Encolar envío
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function FieldRow({ field }: { field: ResolvedField }) {
  return (
    <div className="min-w-0 sm:contents">
      <dt className="text-ink-3">{field.label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className={field.generic ? "italic text-ink-2" : "truncate text-ink"}>{field.value}</span>
        {field.generic && (
          <Tooltip content="Elige una oportunidad en el paso 2 para rellenarlo, o cámbialo a mano en el texto.">
            <span tabIndex={0} className="inline-flex rounded-full">
              <Badge tone="warn" size="sm">Genérico</Badge>
            </span>
          </Tooltip>
        )}
      </dd>
    </div>
  );
}
