"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Coffee, Ellipsis, FileText, Pencil } from "lucide-react";
import type { EquipmentRow } from "@/lib/db";
import { siteById, statusLabel } from "@/lib/equipment/catalog";
import type { NextMaintenanceMap } from "@/lib/equipment/queries";
import type { WarrantyState } from "@/lib/equipment/warranty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATUS_TONE, dateLabel, maintenanceBadge, warrantyBadge } from "@/components/equipment/model";

export type SortKey = "code" | "name" | "site" | "next";
export type SortState = { key: SortKey; dir: "asc" | "desc" };

/** Opciones del selector "Ordenar por" en móvil (en escritorio se ordena desde la cabecera de la tabla). */
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Equipo" },
  { key: "site", label: "Sede" },
  { key: "next", label: "Próximo mantenimiento" },
];

function siteName(row: EquipmentRow): string {
  return siteById(row.site_id)?.name ?? row.site_id;
}

function byCode(a: EquipmentRow, b: EquipmentRow): number {
  return a.site_id.localeCompare(b.site_id) || a.site_seq - b.site_seq;
}

function compare(a: EquipmentRow, b: EquipmentRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "es") || byCode(a, b);
    case "site":
      return siteName(a).localeCompare(siteName(b), "es") || a.site_seq - b.site_seq;
    default:
      return byCode(a, b);
  }
}

export function EquipmentTable({
  rows,
  next,
  today,
  sort,
  onSort,
  page,
  pageSize,
  pageCount,
  onPageChange,
  onOpen,
  hasFilters,
  onClearFilters,
  onCreate,
}: {
  rows: EquipmentRow[];
  next: NextMaintenanceMap;
  today: string;
  sort: SortState;
  onSort: (key: SortKey) => void;
  page: number;
  pageSize: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onOpen: (serial: string) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  const topRef = React.useRef<HTMLDivElement>(null);

  const sorted = React.useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const list = [...rows];
    list.sort((a, b) => {
      if (sort.key !== "next") return dir * compare(a, b, sort.key);
      // Por fecha: los equipos sin fecha base van siempre al final, en cualquier dirección.
      const left = next[a.serial];
      const right = next[b.serial];
      if (!left && !right) return byCode(a, b);
      if (!left) return 1;
      if (!right) return -1;
      return dir * (left.localeCompare(right) || byCode(a, b));
    });
    return list;
  }, [rows, sort, next]);

  const start = (page - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);
  const end = Math.min(start + pageSize, sorted.length);

  /** En móvil, al cambiar de página vuelve al inicio de la lista (en escritorio la tabla ya está a la vista). */
  function changePage(target: number) {
    onPageChange(target);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  if (rows.length === 0) {
    return (
      <TableWrap>
        <EmptyState
          icon={<Coffee />}
          title={hasFilters ? "Ningún equipo coincide con los filtros" : "Todavía no hay equipos"}
          description={hasFilters ? "Prueba con otro serial, código o cliente, o quita los filtros." : "Registra el primer equipo con su serial; el código de tienda y el activo se asignan solos."}
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={onClearFilters}>
                Limpiar filtros
              </Button>
            ) : (
              <Button onClick={onCreate}>Nuevo equipo</Button>
            )
          }
        />
      </TableWrap>
    );
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 bg-surface-2 px-4 py-2 text-xs text-ink-3 max-sm:py-3">
      <span className="num">
        {start + 1}–{end} de {sorted.length}
      </span>
      <span className="num sm:hidden">
        Página {page} de {pageCount}
      </span>
      <div className="flex items-center gap-2 max-sm:w-full max-sm:[&>button]:h-11 max-sm:[&>button]:flex-1 max-sm:[&>button]:text-sm">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => changePage(page - 1)}>
          <ChevronLeft /> Anterior
        </Button>
        <span className="num max-sm:hidden">
          Página {page} de {pageCount}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => changePage(page + 1)}>
          Siguiente <ChevronRight />
        </Button>
      </div>
    </div>
  );

  return (
    <div ref={topRef} className="scroll-mt-16">
      {/* Móvil: selector de orden encima de la lista. */}
      <div className="mb-3 flex items-center gap-2 sm:hidden">
        <label htmlFor="equipment-sort" className="shrink-0 text-xs font-medium text-ink-2">
          Ordenar por
        </label>
        <Select
          id="equipment-sort"
          value={sort.key}
          onChange={(event) => {
            const key = event.target.value as SortKey;
            if (key !== sort.key) onSort(key);
          }}
          className="min-w-0 flex-1"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => onSort(sort.key)}
          aria-label={sort.dir === "asc" ? "Orden ascendente; tocar para invertir" : "Orden descendente; tocar para invertir"}
          title={sort.dir === "asc" ? "Ascendente" : "Descendente"}
        >
          {sort.dir === "asc" ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </div>

      {/* Móvil: lista de filas tocables. Toda la fila abre el panel de edición; el icono de la derecha abre la hoja de vida. */}
      <div className="overflow-hidden rounded-xl border border-line-2 bg-surface shadow-card sm:hidden">
        <ul className="divide-y divide-line-2">
          {visible.map((row) => {
            const warranty = warrantyBadge(row.warranty_until, row.warranty_state as WarrantyState, today);
            const maintenance = maintenanceBadge(next[row.serial], today);
            const href = `/comodatos/${encodeURIComponent(row.serial)}`;
            return (
              <li key={row.serial} className="relative flex items-stretch">
                <button
                  type="button"
                  onClick={() => onOpen(row.serial)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors active:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm leading-snug text-ink">
                        <strong className="num font-semibold">{row.store_code}</strong> <span className="font-medium">{row.name}</span>
                      </span>
                      <Badge tone={STATUS_TONE[row.status] ?? "neutral"} size="sm" dot className="mt-0.5 shrink-0">
                        {statusLabel(row.status)}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">
                      {siteName(row)} · {row.client_name || "Sin cliente"} · {row.category}
                    </span>
                    {(warranty.state === "vencida" || warranty.tone === "warn" || maintenance.tone !== "neutral") && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {warranty.state === "vencida" && (
                          <Badge tone="danger" size="sm">
                            Garantía vencida
                          </Badge>
                        )}
                        {warranty.tone === "warn" && (
                          <Badge tone="warn" size="sm">
                            Garantía: {warranty.label.toLowerCase()}
                          </Badge>
                        )}
                        {maintenance.tone !== "neutral" && (
                          <Badge tone={maintenance.tone} size="sm">
                            Mantenimiento {maintenance.label.toLowerCase()}
                          </Badge>
                        )}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                </button>
                <Link
                  href={href}
                  aria-label={`Hoja de vida de ${row.store_code}`}
                  className="flex w-12 shrink-0 items-center justify-center border-l border-line-2 text-ink-3 transition-colors active:bg-surface-2"
                >
                  <FileText className="size-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        {pagination}
      </div>

      {/* Escritorio: tabla completa con orden desde la cabecera. */}
      <TableWrap className="max-sm:hidden">
        <Table className="min-w-[1040px]">
          <THead>
            <tr>
              <SortableTH label="Código" sortKey="code" sort={sort} onSort={onSort} />
              <SortableTH label="Equipo" sortKey="name" sort={sort} onSort={onSort} />
              <TH>Categoría</TH>
              <SortableTH label="Sede" sortKey="site" sort={sort} onSort={onSort} />
              <TH>Cliente</TH>
              <TH>Estado</TH>
              <TH>Garantía</TH>
              <SortableTH label="Próx. mantenimiento" sortKey="next" sort={sort} onSort={onSort} />
              <TH className="w-12 text-right">
                <span className="sr-only">Acciones</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {visible.map((row) => {
              const warranty = warrantyBadge(row.warranty_until, row.warranty_state as WarrantyState, today);
              const maintenance = maintenanceBadge(next[row.serial], today);
              const href = `/comodatos/${encodeURIComponent(row.serial)}`;
              return (
                <TR key={row.serial} interactive onClick={() => onOpen(row.serial)}>
                  <TD className="num font-semibold text-ink">{row.store_code}</TD>
                  <TD>
                    <span className="block font-medium text-ink">{row.name}</span>
                    <span className="block text-xs text-ink-3">{row.serial}</span>
                  </TD>
                  <TD className="text-ink-2">{row.category}</TD>
                  <TD className="text-ink-2">{siteName(row)}</TD>
                  <TD className="text-ink-2">{row.client_name || "—"}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"} dot>
                      {statusLabel(row.status)}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={warranty.tone}>{warranty.label}</Badge>
                  </TD>
                  <TD>
                    <span className="inline-flex items-center gap-2">
                      {next[row.serial] && <span className="num text-ink-2">{dateLabel(next[row.serial], today)}</span>}
                      {maintenance.tone !== "neutral" && <Badge tone={maintenance.tone}>{maintenance.label}</Badge>}
                    </span>
                  </TD>
                  <TD align="right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${row.store_code}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem asChild>
                          <Link href={href}>
                            <FileText /> Hoja de vida
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onOpen(row.serial)}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {pagination}
      </TableWrap>
    </div>
  );
}

function SortableTH({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TH aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 rounded-sm uppercase tracking-wider hover:text-ink", active && "text-ink")}
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
      </button>
    </TH>
  );
}
