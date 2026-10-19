"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ellipsis, FileSpreadsheet, FunnelX, Plus, Settings } from "lucide-react";
import type { EquipmentRow } from "@/lib/db";
import { COMODATO_STATUSES, SITES } from "@/lib/equipment/catalog";
import type { NextMaintenanceMap } from "@/lib/equipment/queries";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader, Toolbar } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stat, StatGrid } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { EquipmentSheet } from "@/components/equipment/EquipmentSheet";
import { EquipmentTable, type SortKey, type SortState } from "@/components/equipment/EquipmentTable";
import { SettingsDialog } from "@/components/equipment/SettingsDialog";
import { SheetDiffDialog } from "@/components/equipment/SheetDiffDialog";
import { CATALOG_KINDS, maintenanceNeedsAttention, warrantyOf, type CatalogKind, type Lists } from "@/components/equipment/model";

const PAGE_SIZE = 50;

/** Vistas rápidas que aplican los indicadores de arriba (viven en la URL para poder enlazarlas). */
type View = "" | "comodato" | "tienda" | "garantia" | "mantenimiento";
type ClientFilter = "all" | "with" | "without";
type Editor = { mode: "create" } | { mode: "edit"; serial: string } | null;

function haystack(row: EquipmentRow): string {
  return `${row.serial} ${row.name} ${row.store_code} ${row.asset_number} ${row.client_name ?? ""} ${row.category}`.toLowerCase();
}

export function EquipmentDesk({
  initial,
  initialNext,
  lists,
  hourlyRate,
  today,
}: {
  initial: EquipmentRow[];
  initialNext: NextMaintenanceMap;
  lists: Lists;
  hourlyRate: number;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();

  const [rows, setRows] = React.useState(initial);
  const [next, setNext] = React.useState(initialNext);
  const [catalogs, setCatalogs] = React.useState(lists);
  const [rate, setRate] = React.useState(hourlyRate);

  const [query, setQuery] = React.useState("");
  const [site, setSite] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [clientFilter, setClientFilter] = React.useState<ClientFilter>("all");
  const view = (params.get("vista") ?? "") as View;

  const [sort, setSort] = React.useState<SortState>({ key: "code", dir: "asc" });
  const [page, setPage] = React.useState(1);

  const [editor, setEditor] = React.useState<Editor>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [diffOpen, setDiffOpen] = React.useState(false);

  // `?nuevo=1` abre el formulario de alta (lo usa Inicio); `?editar=<serial>` abre ese equipo.
  React.useEffect(() => {
    if (params.get("nuevo") === "1") setEditor({ mode: "create" });
    else if (params.get("editar")) setEditor({ mode: "edit", serial: params.get("editar")! });
  }, [params]);

  React.useEffect(() => setPage(1), [query, site, status, category, clientFilter, view, sort]);

  const counts = React.useMemo(
    () => ({
      total: rows.length,
      comodato: rows.filter((row) => row.status === "en_comodato").length,
      tienda: rows.filter((row) => row.status === "en_tienda").length,
      warranty: rows.filter((row) => warrantyOf(row, today) === "vencida").length,
      maintenance: rows.filter((row) => maintenanceNeedsAttention(next[row.serial], today)).length,
    }),
    [rows, next, today],
  );

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === "comodato" && row.status !== "en_comodato") return false;
      if (view === "tienda" && row.status !== "en_tienda") return false;
      if (view === "garantia" && warrantyOf(row, today) !== "vencida") return false;
      if (view === "mantenimiento" && !maintenanceNeedsAttention(next[row.serial], today)) return false;
      if (site && row.site_id !== site) return false;
      if (status && row.status !== status) return false;
      if (category && row.category !== category) return false;
      if (clientFilter === "with" && !row.client_name) return false;
      if (clientFilter === "without" && row.client_name) return false;
      if (needle && !haystack(row).includes(needle)) return false;
      return true;
    });
  }, [rows, next, today, view, site, status, category, clientFilter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const nextSeqBySite = React.useMemo(() => {
    const max: Record<string, number> = {};
    for (const row of rows) max[row.site_id] = Math.max(max[row.site_id] ?? 0, row.site_seq);
    return max;
  }, [rows]);

  const hasFilters = Boolean(query || site || status || category || clientFilter !== "all" || view);

  function viewHref(target: View): string {
    return view === target || !target ? pathname : `${pathname}?vista=${target}`;
  }

  function clearFilters() {
    setQuery("");
    setSite("");
    setStatus("");
    setCategory("");
    setClientFilter("all");
    if (view) router.replace(pathname);
  }

  function toggleSort(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function closeEditor() {
    setEditor(null);
    if (params.get("nuevo") || params.get("editar")) router.replace(viewHref(view));
  }

  function handleSaved(row: EquipmentRow, nextDate: string | null, created: boolean) {
    setRows((current) => [...current.filter((item) => item.serial !== row.serial), row]);
    setNext((current) => ({ ...current, [row.serial]: nextDate }));
    closeEditor();
    toast({ title: created ? "Equipo creado" : "Equipo guardado", description: `${row.store_code} · ${row.name}` });
  }

  /** Agrega un valor a una lista fija (categoría, cliente, proveedor o ciudad). Devuelve si quedó guardado. */
  async function addToList(kind: CatalogKind, value: string): Promise<boolean> {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      const response = await fetch("/api/comodatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogKind: kind, catalogValue: trimmed }),
      });
      const body = (await response.json()) as { values?: string[]; error?: string };
      if (!response.ok) {
        toast({ tone: "danger", title: "No se pudo agregar", description: body.error ?? "Inténtalo de nuevo." });
        return false;
      }
      const listKey = CATALOG_KINDS.find((item) => item.kind === kind)!.listKey;
      setCatalogs((current) => ({ ...current, [listKey]: body.values ?? [...new Set([...current[listKey], trimmed])] }));
      toast({ title: "Agregado a la lista", description: trimmed });
      return true;
    } catch {
      toast({ tone: "danger", title: "Sin conexión", description: "No se pudo hablar con el servidor." });
      return false;
    }
  }

  const editingRow = editor?.mode === "edit" ? rows.find((row) => row.serial === editor.serial) : undefined;
  const sheetOpen = editor?.mode === "create" || Boolean(editingRow);
  const sheetKey = editor ? (editor.mode === "create" ? "create" : editor.serial) : "closed";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Comercial"
        title="Equipos"
        description={`${counts.total} equipos en tiendas y en comodato. El serial identifica cada uno.`}
        actions={
          <>
            <Button onClick={() => setEditor({ mode: "create" })}>
              <Plus /> Nuevo equipo
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Más acciones">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                  <Settings /> Configuración
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDiffOpen(true)}>
                  <FileSpreadsheet /> Comparar con la hoja de Google
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Serial, nombre, código o cliente" className="w-full sm:w-72" aria-label="Buscar equipo" />
          <Select value={site} onChange={(event) => setSite(event.target.value)} aria-label="Sede" className="w-full sm:w-44">
            <option value="">Todas las sedes</option>
            {SITES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado" className="w-full sm:w-44">
            <option value="">Todos los estados</option>
            {COMODATO_STATUSES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Categoría" className="w-full sm:w-48">
            <option value="">Todas las categorías</option>
            {catalogs.categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Segmented<ClientFilter>
            size="sm"
            ariaLabel="Filtrar por cliente"
            value={clientFilter}
            onChange={setClientFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "with", label: "Con cliente" },
              { value: "without", label: "Sin cliente" },
            ]}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FunnelX /> Limpiar filtros
            </Button>
          )}
          <span className="num ml-auto text-xs text-ink-3" aria-live="polite">
            Mostrando {filtered.length} de {rows.length}
          </span>
        </Toolbar>
      </PageHeader>

      <StatGrid className="mb-5">
        <Stat label="Total" value={counts.total} hint="Equipos registrados" href={viewHref("")} className={cn(!view && "border-navy")} />
        <Stat label="En comodato" value={counts.comodato} tone="info" hint="Entregados a clientes" href={viewHref("comodato")} className={cn(view === "comodato" && "border-navy ring-2 ring-navy/15")} />
        <Stat label="En tienda" value={counts.tienda} hint="Operando en sedes" href={viewHref("tienda")} className={cn(view === "tienda" && "border-navy ring-2 ring-navy/15")} />
        <Stat label="Garantía vencida" value={counts.warranty} tone="danger" hint="Según fecha o la hoja" href={viewHref("garantia")} className={cn(view === "garantia" && "border-navy ring-2 ring-navy/15")} />
        <Stat
          label="Mantenimiento vencido"
          value={counts.maintenance}
          tone="warn"
          hint="Vencido o sin fecha base"
          href={viewHref("mantenimiento")}
          className={cn(view === "mantenimiento" && "border-navy ring-2 ring-navy/15")}
        />
      </StatGrid>

      <EquipmentTable
        rows={filtered}
        next={next}
        today={today}
        sort={sort}
        onSort={toggleSort}
        page={currentPage}
        pageSize={PAGE_SIZE}
        pageCount={pageCount}
        onPageChange={setPage}
        onOpen={(serial) => setEditor({ mode: "edit", serial })}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        onCreate={() => setEditor({ mode: "create" })}
      />

      <EquipmentSheet
        key={sheetKey}
        open={sheetOpen}
        onOpenChange={(open) => !open && closeEditor()}
        mode={editor?.mode === "create" ? "create" : "edit"}
        row={editingRow}
        lists={catalogs}
        rate={rate}
        today={today}
        nextSeqBySite={nextSeqBySite}
        onSaved={handleSaved}
        onAddToList={addToList}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} rate={rate} onRateSaved={setRate} lists={catalogs} onAddToList={addToList} />

      <SheetDiffDialog open={diffOpen} onOpenChange={setDiffOpen} />
    </div>
  );
}
