"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import type { LeadRecord } from "@/lib/db";
import { cn, cop, displaySeller, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { compareLeads, DEFAULT_DIR, GROUP_META, isOverdue, type SortDir, type SortKey, stageGroup, stageShort } from "@/components/pipeline/stage-meta";

const PAGE = 50;

const COLUMNS: { key: SortKey; label: string; sortLabel?: string; align?: "right" }[] = [
  { key: "customer", label: "Cliente" },
  { key: "name", label: "Oportunidad" },
  { key: "stage", label: "Etapa" },
  { key: "salesperson", label: "Vendedor" },
  { key: "expected_revenue", label: "Ingreso", align: "right" },
  { key: "probability", label: "Probabilidad", align: "right" },
  { key: "next_activity_deadline", label: "Próxima actividad" },
  { key: "created_at", label: "Creada", sortLabel: "Fecha de creación" },
];

/**
 * Vista en lista: ordenable por columna, por defecto con la actividad más vencida arriba.
 * En el celular la tabla se convierte en filas tocables con un selector "Ordenar por".
 */
export function LeadTable({ leads, today, selectedKey, onOpen }: { leads: LeadRecord[]; today: string; selectedKey: string | null; onOpen: (importKey: string) => void }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("next_activity_deadline");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [limit, setLimit] = React.useState(PAGE);

  const sorted = React.useMemo(() => [...leads].sort((a, b) => compareLeads(a, b, sortKey, sortDir)), [leads, sortKey, sortDir]);
  const rows = sorted.slice(0, limit);

  // Vuelve a la primera página cuando cambia el conjunto filtrado (no al mover una etapa).
  React.useEffect(() => setLimit(PAGE), [leads.length]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-line-2 bg-surface shadow-card">
        <EmptyState title="Sin oportunidades con esos filtros" description="Prueba a quitar un filtro o a limpiar la búsqueda." />
      </div>
    );
  }

  return (
    <div>
      {/* Celular: orden con un Select y lista de filas tocables. */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center gap-2">
          <Select
            aria-label="Ordenar por"
            value={sortKey}
            onChange={(event) => {
              const key = event.target.value as SortKey;
              setSortKey(key);
              setSortDir(DEFAULT_DIR[key]);
            }}
            className="min-w-0 flex-1"
          >
            {COLUMNS.map((column) => (
              <option key={column.key} value={column.key}>Ordenar por {(column.sortLabel ?? column.label).toLowerCase()}</option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="icon"
            aria-label={sortDir === "asc" ? "Orden ascendente; tocar para invertir" : "Orden descendente; tocar para invertir"}
            onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
          >
            {sortDir === "asc" ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </div>
        <ul className="divide-y divide-line-2 overflow-hidden rounded-xl border border-line-2 bg-surface shadow-card" aria-label="Oportunidades">
          {rows.map((lead) => (
            <li key={lead.import_key}>
              <LeadRow lead={lead} today={today} selected={lead.import_key === selectedKey} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </div>

      <TableWrap className="max-h-[72vh] max-sm:hidden">
        <Table className="min-w-[960px]">
          <THead>
            <tr>
              {COLUMNS.map((column) => {
                const active = column.key === sortKey;
                const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TH key={column.key} align={column.align} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggleSort(column.key)} className={cn("inline-flex items-center gap-1 rounded hover:text-ink", active && "text-ink", column.align === "right" && "flex-row-reverse")}>
                      {column.label}
                      <Icon className={cn("size-3", !active && "opacity-50")} aria-hidden />
                    </button>
                  </TH>
                );
              })}
            </tr>
          </THead>
          <TBody>
            {rows.map((lead) => {
              const group = stageGroup(lead.stage);
              const overdue = isOverdue(lead, today);
              const probability = lead.probability == null ? null : Math.max(0, Math.min(100, Math.round(lead.probability)));
              return (
                <TR
                  key={lead.import_key}
                  interactive
                  selected={lead.import_key === selectedKey}
                  tabIndex={0}
                  onClick={() => onOpen(lead.import_key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(lead.import_key);
                    }
                  }}
                >
                  <TD className="max-w-[220px]">
                    <p className="truncate font-medium text-ink">{lead.customer || <span className="text-ink-3">Sin cliente</span>}</p>
                    {!lead.active && <Badge tone="outline" size="sm" className="mt-0.5">Inactiva</Badge>}
                  </TD>
                  <TD className="max-w-[260px]"><p className="truncate text-ink-2" title={lead.name}>{lead.name}</p></TD>
                  <TD><Badge tone={GROUP_META[group].badge} size="sm">{stageShort(lead.stage)}</Badge></TD>
                  <TD className="whitespace-nowrap text-ink-2">{displaySeller(lead.salesperson)}</TD>
                  <TD align="right" className="whitespace-nowrap">{lead.expected_revenue ? cop(lead.expected_revenue) : <span className="text-ink-3">—</span>}</TD>
                  <TD align="right">
                    {probability == null ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-accent-soft"><span className="block h-full rounded-full bg-navy-2" style={{ width: `${probability}%` }} /></span>
                        <span className="num w-9 text-right text-xs">{probability}%</span>
                      </span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {overdue ? (
                      <Badge tone="danger" size="sm" dot>Vencida · {shortDate(lead.next_activity_deadline)}</Badge>
                    ) : lead.next_activity_deadline ? (
                      <span className="text-ink-2">{shortDate(lead.next_activity_deadline)}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-ink-2">{shortDate(lead.created_at)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span>Mostrando {rows.length} de {sorted.length}</span>
        {rows.length < sorted.length && (
          <Button variant="secondary" size="sm" className="max-sm:h-11 max-sm:w-full max-sm:text-sm" onClick={() => setLimit((value) => value + PAGE)}>
            Mostrar {Math.min(PAGE, sorted.length - rows.length)} más
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fila tocable del celular: cliente en negrita, oportunidad · vendedor, y a la derecha etapa y próxima actividad. */
function LeadRow({ lead, today, selected, onOpen }: { lead: LeadRecord; today: string; selected: boolean; onOpen: (importKey: string) => void }) {
  const group = stageGroup(lead.stage);
  const overdue = isOverdue(lead, today);
  const probability = lead.probability == null ? null : Math.max(0, Math.min(100, Math.round(lead.probability)));
  const meta = [lead.expected_revenue ? cop(lead.expected_revenue) : "Sin ingreso", probability != null ? `${probability}%` : null, !lead.active ? "Inactiva" : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(lead.import_key)}
      aria-current={selected ? "true" : undefined}
      className={cn("flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-2/40", selected && "bg-info-soft")}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{lead.customer || <span className="font-medium text-ink-3">Sin cliente</span>}</p>
        <p className="truncate text-xs text-ink-3">
          {lead.customer ? `${lead.name} · ` : ""}
          {displaySeller(lead.salesperson)}
        </p>
        <p className="num mt-0.5 truncate text-xs text-ink-2">{meta}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={GROUP_META[group].badge} size="sm">{stageShort(lead.stage)}</Badge>
        {overdue ? (
          <Badge tone="danger" size="sm" dot>Vencida · {shortDate(lead.next_activity_deadline)}</Badge>
        ) : lead.next_activity_deadline ? (
          <span className="num text-xs text-ink-2">{shortDate(lead.next_activity_deadline)}</span>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
    </button>
  );
}
