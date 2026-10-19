"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { SalesKpi } from "@/lib/kpi/compute";
import { cn, cop, displaySeller } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
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

function sortValue(kpi: SalesKpi, key: SortKey): number | string {
  if (key === "salesperson") return displaySeller(kpi.salesperson).toLowerCase();
  return kpi[key] ?? -1;
}

/** Tabla comparativa del equipo: una fila por vendedor, ordenable por columna; la fila "Equipo" va arriba como total. */
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

  return (
    <Card>
      <CardHeader title="Equipo" description="Haz clic en una columna para ordenar y en un vendedor para ver su detalle y sus metas." />
      <div className="overflow-auto">
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
