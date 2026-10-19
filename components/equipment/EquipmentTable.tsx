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
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATUS_TONE, dateLabel, maintenanceBadge, warrantyBadge } from "@/components/equipment/model";

export type SortKey = "code" | "name" | "site" | "next";
export type SortState = { key: SortKey; dir: "asc" | "desc" };

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

  return (
    <TableWrap>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 bg-surface-2 px-4 py-2 text-xs text-ink-3">
        <span className="num">
          {start + 1}–{end} de {sorted.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft /> Anterior
          </Button>
          <span className="num">
            Página {page} de {pageCount}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            Siguiente <ChevronRight />
          </Button>
        </div>
      </div>
    </TableWrap>
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
