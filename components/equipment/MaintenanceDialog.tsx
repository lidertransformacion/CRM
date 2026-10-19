"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cop } from "@/lib/utils";
import { CONDITIONS } from "@/components/equipment/model";

const FORM_ID = "maintenance-form";

type Draft = { performedOn: string; kind: "preventivo" | "correctivo"; hours: string; partsCost: string; technician: string; conditionAfter: string; notes: string };

/** Botón "Registrar mantenimiento" con su diálogo. Al guardar refresca la hoja de vida. */
export function MaintenanceDialog({ serial, today, rate, variant = "primary", className }: { serial: string; today: string; rate: number; variant?: "primary" | "secondary"; className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<"performedOn" | "hours", string>>>({});
  const initial: Draft = { performedOn: today, kind: "preventivo", hours: "2", partsCost: "0", technician: "", conditionAfter: "Operativo", notes: "" };
  const [form, setForm] = React.useState<Draft>(initial);

  function patch(changes: Partial<Draft>) {
    setForm((current) => ({ ...current, ...changes }));
    setErrors({});
  }

  const hours = Number(form.hours.replace(",", "."));
  const parts = Number(form.partsCost.replace(",", "."));
  const visitCost = Number.isFinite(hours) && Number.isFinite(parts) ? hours * rate + parts : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!form.performedOn) found.performedOn = "Elige la fecha de la visita";
    if (!Number.isFinite(hours) || hours < 0) found.hours = "Escribe las horas de la visita";
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/comodatos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial, ...form, hours, partsCost: Number.isFinite(parts) ? parts : 0 }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        toast({ tone: "danger", title: "No se pudo registrar", description: body.error ?? "Inténtalo de nuevo." });
        return;
      }
      toast({ title: "Mantenimiento registrado", description: `${form.kind === "preventivo" ? "Preventivo" : "Correctivo"} · ${hours} h · ${cop(visitCost)}` });
      setOpen(false);
      setForm(initial);
      router.refresh();
    } catch {
      toast({ tone: "danger", title: "Sin conexión", description: "No se pudo hablar con el servidor." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className={className}>
        <Wrench /> Registrar mantenimiento
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Registrar mantenimiento" description={`Equipo ${serial}. El costo de la visita es horas × tarifa (${cop(rate)}/h) + repuestos.`}>
          <DialogBody>
            <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
              <FieldGrid cols={2}>
                <Field label="Fecha" required error={errors.performedOn}>
                  <Input type="date" value={form.performedOn} max={today} onChange={(event) => patch({ performedOn: event.target.value })} aria-invalid={Boolean(errors.performedOn)} autoFocus />
                </Field>
                <Field label="Tipo">
                  <Select value={form.kind} onChange={(event) => patch({ kind: event.target.value as Draft["kind"] })}>
                    <option value="preventivo">Preventivo</option>
                    <option value="correctivo">Correctivo</option>
                  </Select>
                </Field>
                <Field label="Horas" required error={errors.hours}>
                  <Input type="number" min={0} step="0.5" inputMode="decimal" value={form.hours} onChange={(event) => patch({ hours: event.target.value })} aria-invalid={Boolean(errors.hours)} />
                </Field>
                <Field label="Repuestos (COP)">
                  <Input type="number" min={0} step={1000} inputMode="numeric" value={form.partsCost} onChange={(event) => patch({ partsCost: event.target.value })} />
                </Field>
                <Field label="Técnico">
                  <Input value={form.technician} onChange={(event) => patch({ technician: event.target.value })} placeholder="Nombre o taller" />
                </Field>
                <Field label="Estado posterior">
                  <Select value={form.conditionAfter} onChange={(event) => patch({ conditionAfter: event.target.value })}>
                    {CONDITIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldGrid>
              <Field label="Notas" hint={visitCost != null ? `Costo de esta visita: ${cop(visitCost)}` : undefined}>
                <Textarea value={form.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="Qué se hizo, qué se cambió, qué quedó pendiente" />
              </Field>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form={FORM_ID} loading={saving}>
              Guardar mantenimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
