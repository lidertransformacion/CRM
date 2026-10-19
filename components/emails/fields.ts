import type { DraftFields, EmailTemplate } from "@/lib/emails/templates";
import type { LeadSummary } from "@/lib/emails/queries";
import { stageOf } from "@/lib/odoo/stages";
import { cop, displaySeller, longDate, todayIso } from "@/lib/utils";

export type { LeadSummary };
export type FieldKey = keyof DraftFields;

export const FIELD_KEYS: FieldKey[] = ["cliente", "oportunidad", "vendedor", "ingreso", "etapa", "fecha"];

export const FIELD_LABELS: Record<FieldKey, string> = {
  cliente: "Cliente",
  oportunidad: "Oportunidad",
  vendedor: "Vendedor",
  ingreso: "Ingreso esperado",
  etapa: "Etapa",
  fecha: "Fecha",
};

/** Texto que entra cuando no hay oportunidad o el dato está vacío. Se marca como genérico en «Datos usados». */
export const GENERIC: Record<Exclude<FieldKey, "fecha">, string> = {
  cliente: "el cliente",
  oportunidad: "la oportunidad",
  vendedor: "[tu nombre]",
  ingreso: "por confirmar",
  etapa: "la etapa actual",
};

export type ResolvedField = { key: FieldKey; label: string; value: string; generic: boolean };

/** Etiqueta corta de la etapa para el correo ("Oferta" en vez de "OFERTA COMERCIAL"). */
export function stageLabel(stage: string): string {
  return stageOf(stage)?.short ?? stage;
}

/** Resuelve las seis variables a partir de la oportunidad (o del texto genérico) y la fecha de hoy. */
export function buildFields(lead: LeadSummary | null, today = todayIso()): ResolvedField[] {
  const pick = (key: Exclude<FieldKey, "fecha">, value: string | null | undefined): ResolvedField => {
    const trimmed = value?.trim();
    return trimmed ? { key, label: FIELD_LABELS[key], value: trimmed, generic: false } : { key, label: FIELD_LABELS[key], value: GENERIC[key], generic: true };
  };
  return [
    pick("cliente", lead?.customer),
    pick("oportunidad", lead?.name),
    pick("vendedor", lead?.salesperson ? displaySeller(lead.salesperson) : null),
    pick("ingreso", lead?.expected_revenue ? cop(lead.expected_revenue) : null),
    pick("etapa", lead?.stage ? stageLabel(lead.stage) : null),
    { key: "fecha", label: FIELD_LABELS.fecha, value: longDate(today), generic: false },
  ];
}

export function toDraftFields(resolved: ResolvedField[]): DraftFields {
  const fields = { cliente: "", oportunidad: "", vendedor: "", ingreso: "", etapa: "", fecha: "" } satisfies DraftFields;
  for (const field of resolved) fields[field.key] = field.value;
  return fields;
}

/** Variables que la plantilla usa de verdad (en asunto o cuerpo), en el orden canónico. */
export function usedFieldKeys(template: Pick<EmailTemplate, "subject" | "body">): FieldKey[] {
  const source = `${template.subject}\n${template.body}`;
  const found = new Set<string>();
  for (const match of source.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) found.add(match[1]);
  return FIELD_KEYS.filter((key) => found.has(key));
}

/** Asunto de ejemplo para la tarjeta de la plantilla: "{{cliente}} · café" → "[cliente] · café". */
export function subjectPreview(subject: string): string {
  return subject.replace(/\{\{\s*(\w+)\s*\}\}/g, "[$1]");
}
