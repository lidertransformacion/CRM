"use client";

import { Copy, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { StepHeader } from "@/components/emails/StepHeader";
import type { FieldKey, ResolvedField } from "@/components/emails/fields";

/**
 * Paso 3: asunto y cuerpo editables, datos usados y botones de copiar. No envía nada.
 * En móvil el pie queda pegado al fondo (por encima de la barra de pestañas) para tener «Copiar borrador» siempre a mano.
 */
export function DraftEditor({
  subject,
  body,
  edited,
  fields,
  usedKeys,
  onSubjectChange,
  onBodyChange,
  onReset,
  onCopyAll,
  onCopySubject,
}: {
  subject: string;
  body: string;
  edited: boolean;
  fields: ResolvedField[];
  usedKeys: FieldKey[];
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onReset: () => void;
  onCopyAll: () => void;
  onCopySubject: () => void;
}) {
  const used = fields.filter((field) => usedKeys.includes(field.key));
  const generic = used.filter((field) => field.generic).length;

  return (
    <Card className="flex min-h-full flex-col">
      <CardHeader
        title={<StepHeader step={3} title="Borrador" hint="Revisa, ajusta lo que quieras y cópialo." />}
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
      <CardFooter className="max-sm:sticky max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-sm:z-10 max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-1 max-sm:px-4">
        <Button variant="secondary" onClick={onCopySubject} className="max-sm:hidden">Copiar solo el asunto</Button>
        <Button variant="link" onClick={onCopySubject} className="sm:hidden">Copiar solo el asunto</Button>
        <Button onClick={onCopyAll}>
          <Copy /> Copiar borrador
        </Button>
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
