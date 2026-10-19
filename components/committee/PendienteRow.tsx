"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { CalendarClock, Check, ChevronDown, Ellipsis, Hourglass, Link2, Plus, Trash, Unlink, UserPlus } from "lucide-react";
import { isOpen } from "@/lib/committee/metrics";
import type { CommitteeAction, CommitteeDoc, Pendiente, PendienteStatus, Punto, Topic } from "@/lib/committee/types";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditableText } from "@/components/ui/editable";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, topicShortName } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, carryBadge, dueBadge, type RowDialog } from "@/components/committee/helpers";

/** Opciones de menú con altura táctil en móvil. */
const MENU_ITEM = "max-sm:py-2.5";

export function PendienteRow({
  doc,
  topic,
  punto,
  item,
  asOf,
  readOnly,
  showContext = false,
  fresh = false,
  onAction,
  onDialog,
}: {
  doc: CommitteeDoc;
  topic: Topic;
  punto: Punto;
  item: Pendiente;
  asOf: string;
  readOnly: boolean;
  /** Muestra "tema · punto" debajo del título (vista por persona y cohortes). */
  showContext?: boolean;
  /** Recién creado: el título abre en modo edición. */
  fresh?: boolean;
  onAction: (action: CommitteeAction) => void;
  onDialog: (dialog: RowDialog) => void;
}) {
  const target = { topicId: topic.id, puntoId: punto.id, pendienteId: item.id };
  const closed = !isOpen(item);
  const carry = carryBadge(doc, item);
  const due = dueBadge(item, asOf);
  const patch = (fields: Partial<Pick<Pendiente, "title" | "status" | "dueOn" | "leadImportKey">>) =>
    onAction({ type: "patchPendiente", ...target, patch: fields });

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 transition-colors",
        closed
          ? "border-line-2 bg-surface opacity-70"
          : carry.tone === "danger"
            ? "border-[#f0b4b4] bg-danger-soft/40"
            : carry.tone === "warn"
              ? "border-[#ead9a3] bg-warn-soft/40"
              : "border-line-2 bg-surface",
      )}
      data-pendiente={item.id}
    >
      {/* Móvil: línea 1 = estado y menú "⋯"; línea 2 = título a ancho completo. Escritorio: estado · título · menú en una fila. */}
      <div className="flex items-start gap-2 max-sm:flex-wrap max-sm:items-center">
        <StatusControl value={item.status} readOnly={readOnly} onChange={(status) => patch({ status })} />
        <div className="min-w-0 flex-1 pt-0.5 max-sm:order-2 max-sm:basis-full max-sm:pt-0">
          <EditableText
            value={item.title}
            onCommit={(title) => patch({ title })}
            placeholder="¿Qué hay que hacer?"
            ariaLabel="Título del pendiente"
            disabled={readOnly}
            autoEdit={fresh}
            className={cn("w-full text-sm font-medium text-ink", closed && "text-ink-3 line-through")}
          />
          {showContext && (
            <p className="mt-0.5 truncate text-xs text-ink-3">
              {topicShortName(topic.title)} · {punto.title || "Punto sin nombre"}
            </p>
          )}
        </div>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Más acciones del pendiente" className="-mr-1 -mt-0.5 max-sm:order-1 max-sm:-my-1 max-sm:-mr-2 max-sm:ml-auto max-sm:h-11 max-sm:w-11">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-sm:min-w-[240px]">
              <DropdownMenuItem className={MENU_ITEM} onSelect={() => onDialog({ kind: "link", target, current: item.leadImportKey })}>
                <Link2 /> {item.leadImportKey ? "Cambiar oportunidad vinculada" : "Vincular oportunidad"}
              </DropdownMenuItem>
              {item.leadImportKey && (
                <DropdownMenuItem className={MENU_ITEM} onSelect={() => patch({ leadImportKey: null })}>
                  <Unlink /> Quitar vínculo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className={MENU_ITEM} onSelect={() => onDialog({ kind: "origin", target, current: item.bornCommitteeNumber })}>
                <CalendarClock /> Cambiar comité de origen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={MENU_ITEM} danger onSelect={() => onDialog({ kind: "delete", target, title: item.title })}>
                <Trash /> Eliminar pendiente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Móvil: línea de responsables + fecha, y debajo los badges (vencido, antigüedad, oportunidad). Escritorio: todo en una fila. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <OwnerPicker
          people={doc.people.map((person) => person.name)}
          owners={item.owners}
          readOnly={readOnly}
          onChange={(owners) => onAction({ type: "setOwners", ...target, owners })}
          className="max-sm:min-w-0 max-sm:flex-1"
        />

        <Input
          type="date"
          aria-label="Fecha límite"
          value={item.dueOn ?? ""}
          disabled={readOnly}
          onChange={(event) => patch({ dueOn: event.target.value || null })}
          className={cn("h-8 w-[150px] px-2 text-xs max-sm:h-11 max-sm:w-[11.25rem] max-sm:shrink-0 max-sm:px-3", due?.tone === "danger" && "border-danger text-danger")}
        />

        <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full sm:contents">
          {due && (
            <Tooltip content={due.tooltip}>
              {/* En escritorio queda pegado a la fecha (6 px), como un solo grupo. */}
              <Badge tone={due.tone} tabIndex={0} className="sm:-ml-1.5">{due.label}</Badge>
            </Tooltip>
          )}

          <Tooltip content={carry.tooltip}>
            <button type="button" className={cn(badgeVariants({ tone: carry.tone }), "cursor-help")} aria-label={`Antigüedad: ${carry.label}. ${carry.tooltip}`}>
              <Hourglass className="size-3" /> {carry.label}
            </button>
          </Tooltip>

          {item.leadImportKey && (
            <Tooltip content="Abrir la oportunidad en el pipeline">
              <Link href={`/pipeline?lead=${encodeURIComponent(item.leadImportKey)}`} className={cn(badgeVariants({ tone: "info" }), "hover:underline")}>
                <Link2 className="size-3" /> Oportunidad
              </Link>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

/** Estado como badge de color; al tocarlo abre un menú con los tres estados. */
function StatusControl({ value, readOnly, onChange }: { value: PendienteStatus; readOnly: boolean; onChange: (status: PendienteStatus) => void }) {
  const meta = STATUS_META[value];
  if (readOnly) {
    return <Badge tone={meta.tone} dot className="mt-0.5 shrink-0 max-sm:mt-0 max-sm:h-8 max-sm:px-3 max-sm:text-[13px]">{meta.label}</Badge>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Estado: ${meta.label}. Cambiar estado`}
          className={cn(
            badgeVariants({ tone: meta.tone }),
            "mt-0.5 shrink-0 cursor-pointer gap-1 pr-1.5 transition-shadow hover:shadow-[0_0_0_2px_rgba(24,43,85,.12)]",
            "max-sm:mt-0 max-sm:h-9 max-sm:gap-1.5 max-sm:px-3 max-sm:pr-2.5 max-sm:text-[13px]",
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {meta.label}
          <ChevronDown className="size-3 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px] max-sm:min-w-[200px]">
        {STATUS_ORDER.map((status) => {
          const option = STATUS_META[status];
          return (
            <DropdownMenuItem key={status} className={MENU_ITEM} onSelect={() => onChange(status)} aria-current={status === value}>
              <span className={cn("size-2 rounded-full", option.tone === "ok" ? "bg-ok" : option.tone === "info" ? "bg-info" : "bg-ink-3")} aria-hidden />
              {option.label}
              {status === value && <Check className="ml-auto" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Responsables como chips navy y un popover con casillas para asignar o dar de alta una persona nueva. */
function OwnerPicker({ people, owners, readOnly, onChange, className }: { people: string[]; owners: string[]; readOnly: boolean; onChange: (owners: string[]) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState("");
  const known = [...new Set([...people, ...owners])];

  function toggle(name: string, checked: boolean) {
    onChange(checked ? [...owners, name] : owners.filter((owner) => owner !== name));
  }
  function addPerson() {
    const name = adding.trim();
    if (!name) return;
    if (!owners.includes(name)) onChange([...owners, name]);
    setAdding("");
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {owners.map((owner) => (
        <Badge key={owner} tone="accent" className="max-sm:h-8 max-sm:px-3 max-sm:text-[13px]">{owner}</Badge>
      ))}
      {owners.length === 0 && readOnly && <Badge tone="outline" className="max-sm:h-8 max-sm:px-3 max-sm:text-[13px]">Sin responsable</Badge>}
      {!readOnly && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <Button variant={owners.length ? "ghost" : "soft"} size="sm" className="h-6 gap-1 rounded-full px-2 text-xs max-sm:h-9 max-sm:min-w-9 max-sm:px-2.5 max-sm:text-[13px]" aria-label={owners.length ? "Cambiar responsables" : "Asignar responsable"}>
              <UserPlus className="size-3.5" /> {owners.length ? "" : "Responsable"}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={6} collisionPadding={8} className="anim-fade-in z-[80] w-60 rounded-lg border border-line-2 bg-surface p-2 shadow-pop outline-none max-sm:w-[min(20rem,calc(100vw-1rem))]">
              <p className="px-1.5 pb-1.5 text-[11px] uppercase tracking-wider text-ink-3">Responsables</p>
              <div className="max-h-56 space-y-0.5 overflow-auto max-sm:max-h-[40vh]">
                {known.map((name) => {
                  const checked = owners.includes(name);
                  return (
                    <label key={name} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink hover:bg-accent-soft max-sm:gap-3 max-sm:px-2 max-sm:py-2 max-sm:text-[15px]">
                      <input type="checkbox" className="size-4 accent-navy max-sm:size-5" checked={checked} onChange={(event) => toggle(name, event.target.checked)} />
                      {name}
                    </label>
                  );
                })}
              </div>
              <form
                className="mt-2 flex gap-1 border-t border-line-2 pt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  addPerson();
                }}
              >
                <Input value={adding} onChange={(event) => setAdding(event.target.value)} placeholder="Persona nueva" aria-label="Nombre de la persona nueva" className="h-8 text-xs" />
                <Button type="submit" size="icon-sm" variant="secondary" aria-label="Agregar persona" disabled={!adding.trim()}>
                  <Plus />
                </Button>
              </form>
              <Popover.Arrow className="fill-surface" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </span>
  );
}
