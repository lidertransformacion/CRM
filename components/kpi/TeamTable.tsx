"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { SalesKpi } from "@/lib/kpi/compute";
import { compactCop } from "@/lib/home/format";
import { cn, cop, displaySeller } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TEAM, formatRate } from "@/components/kpi/targets";

type SortKey = "salesperson" | "open" | "won" | "lost" | "winRate" | "expectedRevenue" | "weightedRevenue" | "overdueActivities" | "inactive";
type SortDir = "asc" | "desc";
type Column = { key: SortKey; label: string; numeric?: boolean };

const COLUMNS: Column[] = [
  { key: "salesperson", label: "Vendedor" },
  { key: "open", label: "Abiertas", numeric: true },
  { key: "won", label: "Ganadas", numeric: true },
  { key: "lost", label: "Perdidas", numeric: true },
  { key: "winRate", label: "Tasa", numeric: true },
  { key: "expectedRevenue", label: "Ingreso esperado", numeric: true },
  { key: "weightedRevenue", label: "Ponderado", numeric: true },
  { key: "overdueActivities", label: "Act. vencidas", numeric: true },
  { key: "inactive", label: "Inactivas", numeric: true },
];

/** Etiquetas completas para el selector "Ordenar por" de móvil (las cabeceras usan versiones cortas). */
const SORT_LABEL: Partial<Record<SortKey, string>> = {
  salesperson: "Nombre",
  winRate: "Tasa de cierre",
  weightedRevenue: "Pronóstico ponderado",
  overdueActivities: "Actividades vencidas",
};

function sortValue(kpi: SalesKpi, key: SortKey): number | string {
  if (key === "salesperson") return displaySeller(kpi.salesperson).toLowerCase();
  return kpi[key] ?? -1;
}

/**
 * Comparativa del equipo: una fila por vendedor con la fila "Equipo" arriba como total.
 * En escritorio es una tabla ordenable por columna; en móvil, una lista de filas tocables con un selector "Ordenar por".
 */
export function TeamTable({ team, people, selected, onSelect }: { team: SalesKpi; people: SalesKpi[]; selected: string; onSelect: (salesperson: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("expectedRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...people].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const diff = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "es") : Number(va) - Number(vb);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [people, sortKey, sortDir]);

  function toggleSort(column: Column) {
    if (column.key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setSortDir(column.numeric ? "desc" : "asc");
    }
  }

  function sortBy(key: SortKey) {
    const column = COLUMNS.find((item) => item.key === key) ?? COLUMNS[0];
    setSortKey(column.key);
    setSortDir(column.numeric ? "desc" : "asc");
  }

  return (
    <Card>
      <CardHeader
        title="Equipo"
        description={
          <>
            <span className="max-sm:hidden">Haz clic en una columna para ordenar y en un vendedor para ver su detalle y sus metas.</span>
            <span className="sm:hidden">Toca un vendedor para ver su detalle y sus metas.</span>
          </>
        }
      />

      {/* Móvil: lista de filas tocables. */}
      <div className="sm:hidden">
        <div className="flex items-center gap-3 border-b border-line-2 px-4 py-2.5">
          <label htmlFor="team-sort" className="shrink-0 text-xs font-medium text-ink-2">Ordenar por</label>
          <Select id="team-sort" value={sortKey} onChange={(event) => sortBy(event.target.value as SortKey)} className="min-w-0 flex-1">
            {COLUMNS.map((column) => (
              <option key={column.key} value={column.key}>{SORT_LABEL[column.key] ?? column.label}</option>
            ))}
          </Select>
        </div>
        <ul className="divide-y divide-line-2">
          <MobileRow kpi={team} label="Equipo" selected={selected === TEAM} onSelect={() => onSelect(TEAM)} total />
          {sorted.map((kpi) => (
            <MobileRow key={kpi.salesperson} kpi={kpi} label={displaySeller(kpi.salesperson)} selected={selected === kpi.salesperson} onSelect={() => onSelect(kpi.salesperson)} />
          ))}
        </ul>
      </div>

      {/* Escritorio: tabla ordenable. */}
      <div className="overflow-auto max-sm:hidden">
        <Table className="min-w-[860px]">
          <THead>
            <tr>
              {COLUMNS.map((column) => {
                const active = column.key === sortKey;
                const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <TH key={column.key} align={column.numeric ? "right" : "left"} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cn("group inline-flex items-center gap-1 rounded hover:text-ink", column.numeric && "flex-row-reverse", active && "text-ink")}
                    >
                      {column.label}
                      <Icon className={cn("size-3.5", active ? "text-navy-2" : "text-ink-3 opacity-40 group-hover:opacity-100")} aria-hidden />
                    </button>
                  </TH>
                );
              })}
            </tr>
          </THead>
          <TBody>
            <Row kpi={team} label="Equipo" selected={selected === TEAM} onSelect={() => onSelect(TEAM)} total />
            {sorted.map((kpi) => (
              <Row key={kpi.salesperson} kpi={kpi} label={displaySeller(kpi.salesperson)} selected={selected === kpi.salesperson} onSelect={() => onSelect(kpi.salesperson)} />
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

function Row({ kpi, label, selected, onSelect, total = false }: { kpi: SalesKpi; label: string; selected: boolean; onSelect: () => void; total?: boolean }) {
  return (
    <TR
      interactive
      selected={selected}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(total && "font-semibold", total && !selected && "bg-surface-2 hover:bg-surface-2")}
      aria-label={`Ver detalle de ${label}`}
    >
      <TD className="whitespace-nowrap">
        <span className={cn("font-medium text-ink", selected && "text-navy-2")}>{label}</span>
        {total && <span className="ml-2 text-[11px] font-normal text-ink-3">total</span>}
      </TD>
      <TD align="right">{kpi.open}</TD>
      <TD align="right">{kpi.won}</TD>
      <TD align="right">{kpi.lost}</TD>
      <TD align="right">{formatRate(kpi.winRate)}</TD>
      <TD align="right" className="whitespace-nowrap">{cop(kpi.expectedRevenue)}</TD>
      <TD align="right" className="whitespace-nowrap">{cop(kpi.weightedRevenue)}</TD>
      <TD align="right">{kpi.overdueActivities > 0 ? <Badge tone="danger">{kpi.overdueActivities}</Badge> : <span className="text-ink-3">0</span>}</TD>
      <TD align="right">{kpi.inactive}</TD>
    </TR>
  );
}

/** Fila de móvil: nombre, resumen en una línea, ingreso esperado compacto y aviso de actividades vencidas. */
function MobileRow({ kpi, label, selected, onSelect, total = false }: { kpi: SalesKpi; label: string; selected: boolean; onSelect: () => void; total?: boolean }) {
  const overdue = kpi.overdueActivities;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Ver detalle de ${label}`}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
          selected ? "bg-info-soft" : total ? "bg-surface-2" : "active:bg-surface-2",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className={cn("truncate text-sm font-semibold text-ink", selected && "text-navy-2")}>{label}</span>
            {total && <span className="shrink-0 text-[11px] text-ink-3">total</span>}
          </span>
          <span className="num block truncate text-xs text-ink-3">
            {kpi.open} abiertas · {kpi.won} ganadas · {formatRate(kpi.winRate)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("num text-sm font-semibold", total ? "text-navy" : "text-ink")}>{compactCop(kpi.expectedRevenue)}</span>
          {overdue > 0 && (
            <Badge tone="danger" size="sm">
              {overdue} {overdue === 1 ? "vencida" : "vencidas"}
            </Badge>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  );
}
