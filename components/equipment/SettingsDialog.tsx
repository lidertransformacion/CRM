"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cop } from "@/lib/utils";
import { CATALOG_KINDS, type CatalogKind, type Lists } from "@/components/equipment/model";

/** Configuración global del módulo: tarifa hora y listas fijas. Separada del registro para no mezclar. */
export function SettingsDialog({
  open,
  onOpenChange,
  rate,
  onRateSaved,
  lists,
  onAddToList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: number;
  onRateSaved: (value: number) => void;
  lists: Lists;
  onAddToList: (kind: CatalogKind, value: string) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState(String(rate));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setDraft(String(rate));
  }, [open, rate]);

  const parsed = Number(draft);
  const rateValid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const rateChanged = rateValid && parsed !== rate;

  async function saveRate() {
    if (!rateValid) return;
    setSaving(true);
    try {
      const response = await fetch("/api/comodatos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourlyRate: parsed }),
      });
      const body = (await response.json()) as { hourlyRate?: number; error?: string };
      if (!response.ok || body.hourlyRate == null) {
        toast({ tone: "danger", title: "No se pudo guardar la tarifa", description: body.error ?? "Inténtalo de nuevo." });
        return;
      }
      onRateSaved(body.hourlyRate);
      toast({ title: "Tarifa guardada", description: `${cop(body.hourlyRate)} por hora de mantenimiento` });
    } catch {
      toast({ tone: "danger", title: "Sin conexión", description: "No se pudo hablar con el servidor." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="Configuración de equipos" description="La tarifa hora y las listas fijas que usan todos los equipos.">
        <DialogBody className="space-y-7">
          <FieldSection title="Tarifa hora de mantenimiento" description="Se usa para el costo anual estimado y para el costo de cada visita registrada.">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="COP por hora" className="w-full sm:w-56" error={!rateValid ? "Escribe un número mayor o igual a cero" : undefined}>
                <Input type="number" min={0} step={1000} inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} aria-invalid={!rateValid} />
              </Field>
              <Button onClick={() => void saveRate()} loading={saving} disabled={!rateChanged} className="mb-[1px] max-sm:w-full">
                Guardar tarifa
              </Button>
            </div>
            <p className="text-xs text-ink-3">Tarifa actual: {cop(rate)}/hora. Es un supuesto configurable, no un precio de la hoja.</p>
          </FieldSection>

          <div className="grid gap-6 sm:grid-cols-2">
            {CATALOG_KINDS.map((item) => (
              <CatalogBlock key={item.kind} kind={item.kind} label={item.label} placeholder={item.placeholder} values={lists[item.listKey]} onAddToList={onAddToList} />
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogBlock({
  kind,
  label,
  placeholder,
  values,
  onAddToList,
}: {
  kind: CatalogKind;
  label: string;
  placeholder: string;
  values: string[];
  onAddToList: (kind: CatalogKind, value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const duplicate = values.some((value) => value.toLowerCase() === draft.trim().toLowerCase());

  async function add() {
    if (!draft.trim() || duplicate) return;
    setBusy(true);
    const ok = await onAddToList(kind, draft);
    setBusy(false);
    if (ok) setDraft("");
  }

  return (
    <FieldSection title={label} description={`${values.length} ${values.length === 1 ? "valor" : "valores"} en la lista`}>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field label={`Agregar ${label.toLowerCase().replace(/s$/, "")}`} className="flex-1 [&>label]:sr-only" error={draft.trim() && duplicate ? "Ya está en la lista" : undefined}>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} aria-invalid={Boolean(draft.trim()) && duplicate} />
        </Field>
        <Button type="submit" variant="soft" loading={busy} disabled={!draft.trim() || duplicate} className="self-start">
          {!busy && <Plus />} Añadir
        </Button>
      </form>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {values.length === 0 && <span className="text-xs text-ink-3">Lista vacía.</span>}
        {values.map((value) => (
          <Badge key={value} tone="outline">
            {value}
          </Badge>
        ))}
      </div>
    </FieldSection>
  );
}
