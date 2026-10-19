"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import type { EquipmentRow } from "@/lib/db";
import { COMODATO_STATUSES, SITES, storeCode } from "@/lib/equipment/catalog";
import { maintenanceCost, type WarrantyState } from "@/lib/equipment/warranty";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cop, displaySeller } from "@/lib/utils";
import { EMPTY_FORM, toForm, toPayload, warrantyBadge, type CatalogKind, type EquipmentForm, type Lists } from "@/components/equipment/model";

const FORM_ID = "equipment-form";

type Errors = Partial<Record<"serial" | "name" | "category", string>>;

function validate(form: EquipmentForm, mode: "create" | "edit"): Errors {
  const errors: Errors = {};
  if (mode === "create" && !form.serial.trim()) errors.serial = "Escribe el serial: es la clave del equipo";
  if (!form.name.trim()) errors.name = "Escribe el nombre del equipo";
  if (!form.category) errors.category = "Elige una categoría";
  return errors;
}

/** Panel lateral para crear o editar un equipo. Se monta con `key` distinta por registro para reiniciar el formulario. */
export function EquipmentSheet({
  open,
  onOpenChange,
  mode,
  row,
  lists,
  rate,
  today,
  nextSeqBySite,
  onSaved,
  onAddToList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  row?: EquipmentRow;
  lists: Lists;
  rate: number;
  today: string;
  nextSeqBySite: Record<string, number>;
  onSaved: (row: EquipmentRow, next: string | null, created: boolean) => void;
  onAddToList: (kind: CatalogKind, value: string) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<EquipmentForm>(() => (row ? toForm(row) : EMPTY_FORM));
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  const creating = mode === "create";

  function patch(changes: Partial<EquipmentForm>) {
    setForm((current) => ({ ...current, ...changes }));
    const touched = Object.keys(changes) as (keyof EquipmentForm)[];
    if (touched.some((key) => key in errors)) setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !touched.includes(key as keyof EquipmentForm))));
  }

  const siteChanged = Boolean(row && row.site_id !== form.siteId);
  const previewCode = row && !siteChanged ? row.store_code : storeCode(form.siteId, (nextSeqBySite[form.siteId] ?? 0) + 1);
  const warranty = warrantyBadge(form.warrantyUntil || null, (row?.warranty_state as WarrantyState | undefined) ?? "desconocida", today);
  const cost = maintenanceCost({
    everyDays: form.everyDays ? Number(form.everyDays) : null,
    hoursMin: form.hoursMin ? Number(form.hoursMin) : null,
    hoursMax: form.hoursMax ? Number(form.hoursMax) : null,
    hourlyRate: rate,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(form, mode);
    if (Object.keys(found).length) {
      setErrors(found);
      toast({ tone: "warn", title: "Faltan datos", description: Object.values(found)[0] });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/comodatos", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const body = (await response.json()) as { equipment?: EquipmentRow; nextMaintenance?: string | null; error?: string };
      if (!response.ok || !body.equipment) {
        toast({ tone: "danger", title: "No se pudo guardar", description: body.error ?? "Revisa los campos e inténtalo de nuevo." });
        return;
      }
      onSaved(body.equipment, body.nextMaintenance ?? null, creating);
    } catch {
      toast({ tone: "danger", title: "Sin conexión", description: "No se pudo hablar con el servidor. Inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="lg"
        eyebrow={creating ? "Nuevo equipo" : `${row?.store_code} · ${row?.asset_number}`}
        title={creating ? "Registrar un equipo" : row?.name ?? "Editar equipo"}
        description={creating ? "El serial identifica el equipo; el código de tienda y el activo se asignan al guardar." : `Serial ${row?.serial}`}
        actions={
          !creating && row ? (
            <Link href={`/comodatos/${encodeURIComponent(row.serial)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ExternalLink /> Ver hoja de vida
            </Link>
          ) : undefined
        }
      >
        <SheetBody>
          <form id={FORM_ID} onSubmit={save} className="space-y-7" noValidate>
            <FieldSection title="Identificación" description="Serial, nombre y sede. El código de tienda sale de la sede.">
              <FieldGrid cols={2}>
                <Field label="Serial" required error={errors.serial} hint={creating ? "No se puede cambiar después de crear" : "El serial no cambia"}>
                  <Input value={form.serial} onChange={(event) => patch({ serial: event.target.value })} disabled={!creating} autoFocus={creating} aria-invalid={Boolean(errors.serial)} placeholder="Ej. C24001551" />
                </Field>
                <Field label="Nombre del equipo" required error={errors.name}>
                  <Input value={form.name} onChange={(event) => patch({ name: event.target.value })} autoFocus={!creating} aria-invalid={Boolean(errors.name)} placeholder="Ej. Mahlkonig EK43" />
                </Field>
                <ListField
                  label="Categoría"
                  required
                  error={errors.category}
                  kind="category"
                  value={form.category}
                  options={lists.categories}
                  emptyOption="Elegir categoría"
                  onChange={(value) => patch({ category: value })}
                  onAddToList={onAddToList}
                />
                <Field label="Sede">
                  <Select value={form.siteId} onChange={(event) => patch({ siteId: event.target.value })}>
                    {SITES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldGrid>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm">
                <span>
                  Código de tienda <strong className="num">{previewCode}</strong>
                </span>
                <span className="text-ink-3 max-sm:hidden">·</span>
                <span>
                  Activo <strong className="num">{row?.asset_number ?? "ACT-…"}</strong>
                </span>
                <span className="basis-full text-xs text-ink-3">
                  {creating
                    ? "El número de activo se asigna al guardar y no cambia nunca."
                    : siteChanged
                      ? `Al cambiar de sede pasa de ${row?.store_code} a ${previewCode}. El activo no cambia.`
                      : "Cambiar la sede asigna el siguiente código de esa sede."}
                </span>
              </div>
            </FieldSection>

            <FieldSection title="Ubicación y cliente" description="Dónde está el equipo y quién lo tiene.">
              <FieldGrid cols={2}>
                <Field label="Estado" hint="Al elegir un cliente pasa a “En comodato”">
                  <Select value={form.status} onChange={(event) => patch({ status: event.target.value })}>
                    {COMODATO_STATUSES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <ListField
                  label="Cliente"
                  kind="client"
                  value={form.clientName}
                  options={lists.clients}
                  emptyOption="Sin cliente"
                  onChange={(value) => patch({ clientName: value, status: value ? "en_comodato" : form.status })}
                  onAddToList={onAddToList}
                />
                <Field label="Dirección">
                  <Input value={form.address} onChange={(event) => patch({ address: event.target.value })} placeholder="Calle, número, local" />
                </Field>
                <ListField label="Ciudad" kind="city" value={form.city} options={lists.cities} emptyOption="Sin ciudad" onChange={(value) => patch({ city: value })} onAddToList={onAddToList} />
                <Field label="Fecha de entrega" hint="Base del próximo mantenimiento si no hay registros">
                  <Input type="date" value={form.deliveredOn} onChange={(event) => patch({ deliveredOn: event.target.value })} />
                </Field>
                <Field label="Vendedor">
                  <Select value={form.salesperson} onChange={(event) => patch({ salesperson: event.target.value })}>
                    <option value="">Sin vendedor</option>
                    {lists.salespeople.map((item) => (
                      <option key={item} value={item}>
                        {displaySeller(item)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Proveedor y garantía">
              <FieldGrid cols={2}>
                <ListField label="Proveedor" kind="supplier" value={form.supplier} options={lists.suppliers} emptyOption="Sin proveedor" onChange={(value) => patch({ supplier: value })} onAddToList={onAddToList} />
                <Field label="Referencia del proveedor">
                  <Input value={form.supplierReference} onChange={(event) => patch({ supplierReference: event.target.value })} />
                </Field>
                <Field label="Modelo">
                  <Input value={form.model} onChange={(event) => patch({ model: event.target.value })} />
                </Field>
                <Field
                  label="Garantía hasta"
                  hint={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Badge tone={warranty.tone} size="sm">
                        {warranty.label}
                      </Badge>
                      {!form.warrantyUntil && warranty.state !== "desconocida" && <span>estado leído de la hoja; pon la fecha para calcularlo</span>}
                    </span>
                  }
                >
                  <Input type="date" value={form.warrantyUntil} onChange={(event) => patch({ warrantyUntil: event.target.value })} />
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Mantenimiento" description="Frecuencia y duración de cada visita preventiva.">
              <FieldGrid cols={3}>
                <Field label="Cada (días)">
                  <Input type="number" min={1} inputMode="numeric" value={form.everyDays} onChange={(event) => patch({ everyDays: event.target.value })} placeholder="90" />
                </Field>
                <Field label="Horas mínimas">
                  <Input type="number" min={0} step="0.5" inputMode="decimal" value={form.hoursMin} onChange={(event) => patch({ hoursMin: event.target.value })} placeholder="1" />
                </Field>
                <Field label="Horas máximas">
                  <Input type="number" min={0} step="0.5" inputMode="decimal" value={form.hoursMax} onChange={(event) => patch({ hoursMax: event.target.value })} placeholder="3" />
                </Field>
              </FieldGrid>
              <p className="text-xs text-ink-3">
                {cost ? (
                  <>
                    Costo anual estimado <strong className="num text-ink">{cop(cost.annualCost)}</strong> · {cost.visitsPerYear.toFixed(1)} visitas de {cost.hours} h a {cop(rate)}/hora. La tarifa se cambia en Configuración.
                  </>
                ) : (
                  "Completa la frecuencia y las horas para estimar el costo anual con la tarifa hora."
                )}
              </p>
            </FieldSection>

            <FieldSection title="Notas">
              <Field label="Observaciones">
                <Textarea value={form.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="Detalles útiles: accesorios, acuerdos con el cliente, estado al entregar…" />
              </Field>
            </FieldSection>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving}>
            Guardar equipo
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Select de lista fija con la opción de agregar un valor nuevo sin salir del formulario. */
function ListField({
  label,
  kind,
  value,
  options,
  emptyOption,
  onChange,
  onAddToList,
  required,
  error,
}: {
  label: string;
  kind: CatalogKind;
  value: string;
  options: string[];
  emptyOption: string;
  onChange: (value: string) => void;
  onAddToList: (kind: CatalogKind, value: string) => Promise<boolean>;
  required?: boolean;
  error?: string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function cancel() {
    setAdding(false);
    setDraft("");
  }

  async function confirm() {
    if (!draft.trim()) return;
    setBusy(true);
    const ok = await onAddToList(kind, draft);
    setBusy(false);
    if (ok) {
      onChange(draft.trim());
      cancel();
    }
  }

  return (
    <Field
      label={label}
      required={required}
      error={error}
      hint={
        adding ? (
          "Enter guarda en la lista · Esc cancela"
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 font-medium text-navy-2 hover:underline">
            <Plus className="size-3" /> Agregar a la lista
          </button>
        )
      }
    >
      {adding ? (
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Nuevo valor de ${label.toLowerCase()}`}
            aria-label={`Nuevo valor de ${label.toLowerCase()}`}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirm();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
          <Button type="button" size="icon" variant="soft" onClick={() => void confirm()} loading={busy} aria-label="Guardar en la lista">
            {!busy && <Check />}
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={cancel} aria-label="Cancelar">
            <X />
          </Button>
        </div>
      ) : (
        <Select value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)}>
          <option value="">{emptyOption}</option>
          {options.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          {value && !options.includes(value) && <option value={value}>{value}</option>}
        </Select>
      )}
    </Field>
  );
}
