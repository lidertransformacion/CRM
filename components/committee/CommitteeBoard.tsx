"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, Ellipsis, FileSpreadsheet, GitCompare, LayoutList, ListChecks, Lock, Mail, Plus, RefreshCw, Users } from "lucide-react";
import { flatten, matchesPerson, topicIsClosed } from "@/lib/committee/metrics";
import { applyAction } from "@/lib/committee/mutate";
import type { CommitteeAction, CommitteeDoc } from "@/lib/committee/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditableText } from "@/components/ui/editable";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Toolbar } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SaveIndicator, useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, longDate, shortDate, uid } from "@/lib/utils";
import { AttachLinkDialog, ConfirmDialog, EmailDialog, LeadLinkDialog, NewCommitteeDialog, OriginDialog } from "@/components/committee/dialogs";
import { PeopleAside } from "@/components/committee/PeopleAside";
import { PersonView } from "@/components/committee/PersonView";
import { TopicCard } from "@/components/committee/TopicCard";
import {
  DEFAULT_FILTERS,
  isNarrow,
  matchesFilters,
  peopleSummary,
  personLabel,
  plural,
  resolvePersonKey,
  summarize,
  topicVisible,
  type BoardDialog,
  type Filters,
  type Focus,
  type SaveState,
  type ViewMode,
} from "@/components/committee/helpers";

export type HistoryRow = { number: number; held_on: string; is_current: number; snapshot: boolean };

type Mode = "live" | "snapshot" | "cohort" | "loading";

export function CommitteeBoard({
  initialDoc,
  history,
  asOf,
  initialPerson = null,
  initialView = "topic",
  openEmail = false,
  initialCommittee = null,
}: {
  initialDoc: CommitteeDoc;
  history: HistoryRow[];
  /** Fecha de hoy (ISO) calculada en el servidor para que cliente y servidor coincidan. */
  asOf: string;
  /** Deep links: `?persona=`, `?vista=persona`, `?correo=1`, `?comite=N`. */
  initialPerson?: string | null;
  initialView?: ViewMode;
  openEmail?: boolean;
  initialCommittee?: number | null;
}) {
  const { toast } = useToast();
  const [doc, setDoc] = useState(initialDoc);
  const docRef = useRef(initialDoc);
  const [archive, setArchive] = useState<Record<number, CommitteeDoc>>({});
  const [menu, setMenu] = useState(history);
  const [viewing, setViewing] = useState(() =>
    initialCommittee != null && history.some((item) => item.number === initialCommittee) ? initialCommittee : initialDoc.committee.number,
  );
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, person: resolvePersonKey(initialDoc, initialPerson) });
  const [view, setView] = useState<ViewMode>(initialView);
  const [save, setSave] = useState<SaveState>("saved");
  const [emailOpen, setEmailOpen] = useState(openEmail);
  const [nextOpen, setNextOpen] = useState(false);
  const [dialog, setDialog] = useState<BoardDialog | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);

  /* ── Modo: acta actual, acta archivada, cohorte o cargando ────────────── */
  const live = viewing === doc.committee.number;
  const menuRow = menu.find((item) => item.number === viewing);
  const snapshot = live ? null : (archive[viewing] ?? null);
  const mode: Mode = live ? "live" : snapshot ? "snapshot" : menuRow?.snapshot ? "loading" : "cohort";
  const shown = live ? doc : (snapshot ?? doc);
  const readOnly = !live;
  const heldOn = mode === "cohort" ? (menuRow?.held_on ?? shown.committee.heldOn) : shown.committee.heldOn;

  useEffect(() => {
    if (mode !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/committee?number=${viewing}`);
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as { doc: CommitteeDoc };
        if (!cancelled) setArchive((items) => ({ ...items, [viewing]: payload.doc }));
      } catch {
        if (cancelled) return;
        toast({ title: "No se pudo cargar ese comité", description: "Vuelves al comité actual.", tone: "danger" });
        setViewing(docRef.current.committee.number);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, viewing, toast]);

  /* ── Cola de guardado: una acción tras otra, en orden; si una falla se detiene ── */
  const pending = useRef<CommitteeAction[]>([]);
  const flushing = useRef(false);
  const errored = useRef(false);

  async function flush() {
    if (flushing.current || errored.current) return;
    flushing.current = true;
    while (pending.current.length) {
      const action = pending.current[0];
      try {
        const response = await fetch("/api/committee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `Error ${response.status}`);
        }
        const payload = (await response.json()) as { doc: CommitteeDoc; history: HistoryRow[] };
        pending.current.shift();
        if (action.type === "newCommittee") {
          docRef.current = payload.doc;
          setDoc(payload.doc);
          setMenu(payload.history);
          setViewing(payload.doc.committee.number);
          toast({ title: `Comité #${payload.doc.committee.number} creado`, description: "Los pendientes abiertos pasaron al comité nuevo." });
        }
      } catch (error) {
        errored.current = true;
        flushing.current = false;
        setSave("error");
        toast({
          title: "No se pudo guardar",
          description: `${error instanceof Error ? error.message : "Sin conexión"}. Los cambios siguen en pantalla: pulsa «Reintentar».`,
          tone: "danger",
        });
        return;
      }
    }
    flushing.current = false;
    setSave("saved");
  }

  function retry() {
    errored.current = false;
    setSave("saving");
    void flush();
  }

  function commit(action: CommitteeAction) {
    if (readOnly) return;
    let next: CommitteeDoc;
    try {
      next = applyAction(docRef.current, action);
    } catch (error) {
      toast({ title: "No se pudo aplicar el cambio", description: error instanceof Error ? error.message : undefined, tone: "danger" });
      return;
    }
    if (action.type === "newCommittee") {
      const previous = docRef.current;
      setArchive((items) => ({ ...items, [previous.committee.number]: previous }));
      setViewing(next.committee.number);
    }
    docRef.current = next;
    setDoc(next);
    setFreshId(action.type.startsWith("add") && "id" in action ? action.id : null);
    pending.current.push(action);
    setSave("saving");
    void flush();
  }

  /* ── Filas y resúmenes ────────────────────────────────────────────────── */
  const effectiveFilters = useMemo<Filters>(() => ({ ...filters, born: mode === "cohort" ? viewing : null }), [filters, mode, viewing]);
  const scopedRows = useMemo(() => {
    const rows = flatten(shown);
    return mode === "cohort" ? rows.filter((row) => row.pendiente.bornCommitteeNumber === viewing) : rows;
  }, [shown, mode, viewing]);
  const personRows = useMemo(() => scopedRows.filter((row) => matchesPerson(row.pendiente, filters.person)), [scopedRows, filters.person]);
  const stats = useMemo(() => summarize(shown, personRows, asOf), [shown, personRows, asOf]);
  const people = useMemo(() => peopleSummary(shown, scopedRows, asOf), [shown, scopedRows, asOf]);
  const visibleRows = useMemo(() => scopedRows.filter((row) => matchesFilters(shown, row.pendiente, effectiveFilters, asOf)), [scopedRows, shown, effectiveFilters, asOf]);

  const openTopics = useMemo(() => shown.topics.filter((topic) => !topicIsClosed(topic)).sort((a, b) => a.number - b.number), [shown]);
  const closedTopics = useMemo(() => shown.topics.filter(topicIsClosed).sort((a, b) => a.number - b.number), [shown]);
  const visibleOpen = openTopics.filter((topic) => topicVisible(shown, topic, effectiveFilters, asOf));
  const visibleClosed = closedTopics.filter((topic) => topicVisible(shown, topic, effectiveFilters, asOf));

  function setPerson(person: string | null) {
    setFilters((current) => ({ ...current, person }));
  }
  function toggleFocus(focus: Exclude<Focus, null>) {
    setFilters((current) => ({ ...current, focus: current.focus === focus ? null : focus, scope: focus === "closedSince" ? "closed" : "open" }));
  }
  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }
  const showAll = () => setFilters((current) => ({ ...current, scope: "all", focus: null }));

  /* ── Deep links: la URL refleja persona, vista y comité ───────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filters.person) params.set("persona", personLabel(filters.person));
    else params.delete("persona");
    if (view === "person") params.set("vista", "persona");
    else params.delete("vista");
    if (viewing !== doc.committee.number) params.set("comite", String(viewing));
    else params.delete("comite");
    params.delete("correo");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters.person, view, viewing, doc.committee.number]);

  /* ── Diálogos de confirmación derivados del estado ────────────────────── */
  const confirm = useMemo<{ title: string; description: ReactNode; label: string; action: CommitteeAction } | null>(() => {
    if (!dialog) return null;
    switch (dialog.kind) {
      case "delete":
        return {
          title: "Eliminar pendiente",
          description: <>Se elimina «{dialog.title.trim() || "pendiente sin título"}» del acta. Esta acción no se puede deshacer.</>,
          label: "Eliminar pendiente",
          action: { type: "deletePendiente", topicId: dialog.target.topicId, puntoId: dialog.target.puntoId, pendienteId: dialog.target.pendienteId },
        };
      case "deletePunto":
        return {
          title: "Eliminar punto",
          description: (
            <>
              Se elimina «{dialog.title.trim() || "punto sin nombre"}»{dialog.count > 0 ? ` con sus ${plural(dialog.count, "pendiente", "pendientes")}` : ""}. Esta acción no se puede deshacer.
            </>
          ),
          label: "Eliminar punto",
          action: { type: "deletePunto", topicId: dialog.target.topicId, puntoId: dialog.target.puntoId },
        };
      case "deleteDecision":
        return {
          title: "Quitar decisión",
          description: <>Se quita la decisión «{dialog.body.trim() || "sin texto"}» del tema.</>,
          label: "Quitar decisión",
          action: { type: "deleteDecision", topicId: dialog.topicId, decisionId: dialog.decisionId },
        };
      case "deleteTopic":
        return {
          title: "Eliminar tema",
          description: (
            <>
              Se elimina «{dialog.title.trim() || "tema sin nombre"}» con {plural(dialog.puntos, "punto", "puntos")} y {plural(dialog.pendientes, "pendiente", "pendientes")}. Esta acción no se puede deshacer.
            </>
          ),
          label: "Eliminar tema",
          action: { type: "deleteTopic", topicId: dialog.topicId },
        };
      default:
        return null;
    }
  }, [dialog]);

  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const narrow = isNarrow(effectiveFilters);
  const nothingVisible = view === "topic" ? visibleOpen.length === 0 && visibleClosed.length === 0 : visibleRows.length === 0;

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="page">
      <PageHeader
        eyebrow={`${mode === "cohort" ? "Cohorte · " : ""}Comité #${viewing} · ${longDate(heldOn)} · ${shown.committee.area}`}
        title={
          <EditableText
            as="span"
            value={shown.committee.title}
            onCommit={(title) => commit({ type: "patchCommittee", patch: { title } })}
            placeholder="Nombre del comité"
            ariaLabel="Título del comité"
            disabled={readOnly}
          />
        }
        description="Actas, decisiones y pendientes por responsable. Los cambios se guardan solos."
        actions={
          /* El contenedor de acciones de PageHeader no encoge; el tope al ancho del viewport evita desbordar a 390 px. */
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 sm:mr-1">
              <SaveIndicator state={save} />
              {save === "error" && (
                <Button size="sm" variant="danger-soft" onClick={retry}>
                  <RefreshCw /> Reintentar
                </Button>
              )}
            </span>
            <Button variant="secondary" onClick={() => setNextOpen(true)} disabled={readOnly}>
              <Plus /> Nuevo comité
            </Button>
            <Button onClick={() => setEmailOpen(true)} disabled={mode === "cohort" || mode === "loading"}>
              <Mail /> Correo resumen
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Más acciones">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <a href="/api/committee/export?format=csv">
                    <FileSpreadsheet /> Exportar CSV
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/api/committee/export?format=json">
                    <Download /> Exportar JSON
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/comites/comparar">
                    <GitCompare /> Comparar comités
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <Toolbar>
          <Segmented
            ariaLabel="Qué pendientes ver"
            value={filters.scope}
            onChange={(scope) => setFilters((current) => ({ ...current, scope, focus: null }))}
            options={[
              { value: "open", label: "Abiertos", count: stats.open },
              { value: "all", label: "Todos", count: stats.total },
              { value: "closed", label: "Cerrados", count: stats.closed, tone: "ok" },
            ]}
          />
          <Segmented
            ariaLabel="Vista"
            value={view}
            onChange={setView}
            options={[
              { value: "topic", label: <><LayoutList className="size-3.5" aria-hidden /> Por tema</> },
              { value: "person", label: <><Users className="size-3.5" aria-hidden /> Por persona</> },
            ]}
          />
          <Select aria-label="Comité que estás viendo" value={viewing} onChange={(event) => setViewing(Number(event.target.value))} className="w-full sm:ml-auto sm:w-auto sm:min-w-[240px]">
            {menu.map((item) => (
              <option key={item.number} value={item.number}>
                Comité #{item.number} · {shortDate(item.held_on)} · {item.is_current ? "actual" : item.snapshot ? "acta archivada" : "cohorte"}
              </option>
            ))}
          </Select>
          <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por responsable">
            <Chip active={!filters.person} onClick={() => setPerson(null)}>Todos</Chip>
            {people.map((item) => {
              const active = filters.person === item.key;
              /* En "Abiertos" no tiene sentido un chip con 0 abiertos; en "Todos" o "Cerrados" sí. */
              if (item.open === 0 && filters.scope === "open" && !active) return null;
              return (
                <Chip key={item.key} active={active} alert={!active && (item.overdue > 0 || item.carried > 0)} count={item.open} onClick={() => setPerson(active ? null : item.key)}>
                  {item.name}
                </Chip>
              );
            })}
          </div>
        </Toolbar>
      </PageHeader>

      {readOnly && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#ead9a3] bg-warn-soft/60 px-4 py-3 text-sm text-ink-2">
          <Badge tone="warn"><Lock className="size-3" /> Solo lectura</Badge>
          <span className="min-w-0 flex-1">
            {mode === "cohort"
              ? `Cohorte del comité #${viewing} (${longDate(heldOn)}): los pendientes que nacieron ese día, vistos desde el acta actual (#${doc.committee.number}).`
              : mode === "snapshot"
                ? `Acta archivada del comité #${viewing} (${longDate(heldOn)}). Para editar, vuelve al comité actual.`
                : "Cargando el acta archivada…"}
          </span>
          <Button variant="link" size="sm" onClick={() => setViewing(doc.committee.number)}>
            Volver al comité #{doc.committee.number}
          </Button>
        </div>
      )}

      <StatGrid className="mb-5 md:grid-cols-4 xl:grid-cols-4">
        <StatButton
          label="Abiertos"
          value={stats.open}
          hint={`de ${plural(stats.total, "pendiente", "pendientes")}${filters.person ? ` de ${personLabel(filters.person)}` : ""}`}
          tooltip="Pendientes que no están cerrados, sin importar la fecha."
          active={filters.scope === "open" && !filters.focus}
          onClick={() => setFilters((current) => ({ ...current, scope: "open", focus: null }))}
        />
        <StatButton
          label="Vencidos"
          value={stats.overdue}
          tone={stats.overdue > 0 ? "danger" : "neutral"}
          hint="fecha límite ya pasada"
          tooltip="Vencido: pendiente abierto cuya fecha límite ya pasó."
          active={filters.focus === "overdue"}
          onClick={() => toggleFocus("overdue")}
        />
        <StatButton
          label="Arrastrados 2+"
          value={stats.carried}
          tone={stats.carried > 0 ? "danger" : "neutral"}
          hint="2 o más comités sin cerrar"
          tooltip="Arrastrado: lleva 2 o más comités sin cerrarse (comité actual menos comité en el que nació)."
          active={filters.focus === "carried"}
          onClick={() => toggleFocus("carried")}
        />
        <StatButton
          label="Cerrados desde el último comité"
          value={stats.closedSince}
          tone="ok"
          hint={`cerrados en el comité #${shown.committee.number}`}
          tooltip="Pendientes marcados como cerrados en este comité. Son los que salen en el correo resumen."
          active={filters.focus === "closedSince"}
          onClick={() => toggleFocus("closedSince")}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {mode === "loading" ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : nothingVisible ? (
            <Card>
              <EmptyState
                icon={<ListChecks />}
                title={narrow || filters.scope !== "open" ? "Nada que mostrar con estos filtros" : "No hay pendientes abiertos"}
                description={
                  narrow || filters.scope !== "open"
                    ? "Prueba con «Todos» o quita el filtro de persona para ver el resto del acta."
                    : readOnly
                      ? "Esta acta no tiene pendientes abiertos."
                      : "Crea un tema y empieza a registrar puntos y pendientes."
                }
                action={
                  narrow || filters.scope !== "open" ? (
                    <Button variant="secondary" onClick={clearFilters}>Quitar filtros</Button>
                  ) : !readOnly ? (
                    <Button onClick={() => commit({ type: "addTopic", id: uid() })}>
                      <Plus /> Nuevo tema
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : view === "person" ? (
            <PersonView doc={shown} rows={visibleRows} asOf={asOf} readOnly={readOnly} freshId={freshId} onAction={commit} onDialog={setDialog} onClearFilters={clearFilters} />
          ) : (
            <>
              {visibleOpen.map((topic) => (
                <TopicCard key={topic.id} topic={topic} doc={shown} asOf={asOf} filters={effectiveFilters} readOnly={readOnly} freshId={freshId} onAction={commit} onDialog={setDialog} onShowAll={showAll} />
              ))}
              {visibleClosed.length > 0 && (
                <section className="space-y-4" aria-label="Temas cerrados">
                  <h2 className="eyebrow flex items-center gap-2 pt-2 font-sans">
                    Temas cerrados <Badge tone="ok" size="sm">{visibleClosed.length}</Badge>
                  </h2>
                  {visibleClosed.map((topic) => (
                    <TopicCard key={topic.id} topic={topic} doc={shown} asOf={asOf} filters={effectiveFilters} readOnly={readOnly} freshId={freshId} onAction={commit} onDialog={setDialog} onShowAll={showAll} />
                  ))}
                </section>
              )}
            </>
          )}

          {!readOnly && view === "topic" && !nothingVisible && (
            <Button variant="secondary" className="w-full border-dashed" onClick={() => commit({ type: "addTopic", id: uid() })}>
              <Plus /> Nuevo tema
            </Button>
          )}

          {mode !== "loading" && view === "topic" && filters.scope === "open" && closedTopics.length > 0 && !narrow && (
            <p className="text-center text-xs text-ink-3">
              {plural(closedTopics.length, "tema cerrado oculto", "temas cerrados ocultos")} ·{" "}
              <button type="button" className="text-navy-2 underline-offset-4 hover:underline" onClick={showAll}>
                ver todos
              </button>
            </p>
          )}
        </div>

        <PeopleAside people={people} person={filters.person} onSelect={setPerson} />
      </div>

      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} doc={shown} asOf={asOf} />
      <NewCommitteeDialog open={nextOpen} onOpenChange={setNextOpen} doc={doc} asOf={asOf} onCreate={(heldOn) => commit({ type: "newCommittee", heldOn })} />
      <LeadLinkDialog
        open={dialog?.kind === "link"}
        onOpenChange={closeDialog}
        current={dialog?.kind === "link" ? dialog.current : null}
        onPick={(key) => {
          if (dialog?.kind !== "link") return;
          const { topicId, puntoId, pendienteId } = dialog.target;
          if (pendienteId) commit({ type: "patchPendiente", topicId, puntoId, pendienteId, patch: { leadImportKey: key } });
          else commit({ type: "linkPunto", topicId, puntoId, leadImportKey: key });
          setDialog(null);
        }}
      />
      <OriginDialog
        open={dialog?.kind === "origin"}
        onOpenChange={closeDialog}
        doc={shown}
        current={dialog?.kind === "origin" ? dialog.current : shown.committee.number}
        onSave={(number) => {
          if (dialog?.kind !== "origin") return;
          commit({ type: "patchPendiente", ...dialog.target, patch: { bornCommitteeNumber: number } });
        }}
      />
      <AttachLinkDialog
        open={dialog?.kind === "attach"}
        onOpenChange={closeDialog}
        onAdd={(label, url) => {
          if (dialog?.kind !== "attach") return;
          commit({ type: "addLink", topicId: dialog.target.topicId, puntoId: dialog.target.puntoId, id: uid(), label, url });
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={closeDialog}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.label ?? "Eliminar"}
        onConfirm={() => {
          if (confirm) commit(confirm.action);
        }}
      />
    </div>
  );
}

/** Indicador clicable: aplica el filtro correspondiente y se marca cuando está activo. */
function StatButton({
  active,
  onClick,
  tooltip,
  tone = "neutral",
  ...stat
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
  active: boolean;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={tooltip}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        className="cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40"
      >
        <Stat {...stat} tone={tone} className={cn("h-full transition-colors hover:border-line hover:bg-surface-2", active && "border-navy bg-accent-soft/50 ring-1 ring-navy")} />
      </div>
    </Tooltip>
  );
}
