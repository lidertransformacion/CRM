"use client";

import { Check } from "lucide-react";
import type { EmailTemplate } from "@/lib/emails/templates";
import { cn } from "@/lib/utils";
import { subjectPreview } from "@/components/emails/fields";

/** Paso 1: tarjetas seleccionables, una por plantilla. */
export function TemplatePicker({ templates, value, onChange }: { templates: EmailTemplate[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Plantilla" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      {templates.map((template) => {
        const active = template.id === value;
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(template.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40",
              active ? "border-navy bg-accent-soft/50 ring-1 ring-navy" : "border-line-2 bg-surface hover:border-line hover:bg-surface-2",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm font-medium", active ? "text-navy" : "text-ink")}>{template.name}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-3">{subjectPreview(template.subject)}</span>
            </span>
            <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", active ? "border-navy bg-navy text-crema" : "border-line bg-surface text-transparent")} aria-hidden>
              <Check className="size-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
