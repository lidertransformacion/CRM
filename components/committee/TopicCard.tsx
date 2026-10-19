"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Diamond, Ellipsis, ExternalLink, FileText, Link2, Paperclip, Plus, Timer, Trash, Unlink, X } from "lucide-react";
import { carryCount, isOpen, topicIsClosed, topicStats } from "@/lib/committee/metrics";
import type { CommitteeAction, CommitteeDoc, Punto, Topic } from "@/lib/committee/types";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditableText } from "@/components/ui/editable";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, uid } from "@/lib/utils";
import { PendienteRow } from "@/components/committee/PendienteRow";
import { TAGS, matchesFilters, plural, visiblePuntos, type BoardDialog, type Filters } from "@/components/committee/helpers";

type Shared = {
  doc: CommitteeDoc;
  asOf: string;
  filters: Filters;
  readOnly: boolean;
  /** Id del registro recién creado: su título abre en edición. */
  freshId: string | null;
  onAction: (action: CommitteeAction) => void;
  onDialog: (dialog: BoardDialog) => void;
  /** Cambia el filtro a "Todos" para ver lo cerrado que está oculto. */
  onShowAll: () => void;
};

export function TopicCard({ topic, ...shared }: Shared & { topic: Topic }) {
  const { doc, filters, asOf, readOnly, freshId, onAction, onDialog } = shared;
  const [collapsed, setCollapsed] = useState(false);
  const stats = topicStats(doc, topic);
  const puntos = visiblePuntos(doc, topic, filters, asOf);
  const hiddenPuntos = topic.puntos.length - puntos.length;
  const closed = topicIsClosed(topic);
  const totalPendientes = topic.puntos.reduce((sum, punto) => sum + punto.pendientes.length, 0);

  const patch = (fields: Partial<Pick<Topic, "number" | "title" | "context" | "minutes" | "tags">>) => onAction({ type: "patchTopic", topicId: topic.id, patch: fields });

  return (
    <Card id={`tema-${topic.id}`} className={cn(closed && "bg-surface-2/60")}>
      <div className="flex items-start gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={!collapsed}
          aria-controls={`tema-body-${topic.id}`}
          aria-label={collapsed ? "Mostrar el tema" : "Contraer el tema"}
          onClick={() => setCollapsed((value) => !value)}
          className="mt-0.5 shrink-0"
        >
          <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />
        </Button>
        <EditableText
          type="number"
          value={String(topic.number)}
          onCommit={(value) => {
            const number = Number(value);
            if (Number.isFinite(number) && number > 0) patch({ number });
          }}
          ariaLabel="Número del tema"
          disabled={readOnly}
          className="num mt-0.5 shrink-0 font-serif text-2xl leading-none text-ink-3"
          inputClassName="w-16"
        />
        <div className="min-w-0 flex-1">
          <EditableText
            as="h2"
            value={topic.title}
            onCommit={(title) => patch({ title })}
            placeholder="Nombre del tema"
            ariaLabel="Título del tema"
            disabled={readOnly}
            autoEdit={freshId === topic.id}
            className={cn("font-sans text-base font-semibold text-ink sm:text-lg", closed && "text-ink-2")}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {TAGS.map((tag) => {
              const on = topic.tags.includes(tag);
              if (readOnly && !on) return null;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  disabled={readOnly}
                  onClick={() => patch({ tags: on ? topic.tags.filter((item) => item !== tag) : [...topic.tags, tag] })}
                  className={cn(
                    badgeVariants({ tone: on ? "info" : "outline", size: "sm" }),
                    !on && "border-dashed text-ink-3",
                    !readOnly && "cursor-pointer transition-colors hover:border-navy-2",
                  )}
                  title={readOnly ? undefined : on ? `Quitar etiqueta ${tag}` : `Etiquetar como ${tag}`}
                >
                  {tag}
                </button>
              );
            })}
            <span className="inline-flex items-center gap-1 text-xs text-ink-2">
              <Timer className="size-3.5 text-ink-3" aria-hidden />
              <EditableText
                type="number"
                value={topic.minutes == null ? "" : String(topic.minutes)}
                onCommit={(value) => patch({ minutes: value.trim() === "" ? null : Math.max(0, Number(value)) })}
                placeholder="—"
                ariaLabel="Minutos asignados al tema"
                disabled={readOnly}
                className="text-xs"
                inputClassName="w-14 text-xs"
              />
              min
            </span>
            <span className="num ml-auto text-xs text-ink-2">
              {plural(stats.open, "abierto", "abiertos")}
              {stats.carried > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-danger">{plural(stats.carried, "arrastrado", "arrastrados")}</span>
                </>
              )}
            </span>
            {closed && <Badge tone="ok" dot>Cerrado</Badge>}
          </div>
        </div>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Más acciones del tema" className="shrink-0">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onAction({ type: "addPunto", topicId: topic.id, id: uid() })}>
                <Plus /> Agregar punto
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction({ type: "addDecision", topicId: topic.id, id: uid(), body: "" })}>
                <Diamond /> Añadir decisión clave
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => onDialog({ kind: "deleteTopic", topicId: topic.id, title: topic.title, puntos: topic.puntos.length, pendientes: totalPendientes })}>
                <Trash /> Eliminar tema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!collapsed && (
        <CardBody id={`tema-body-${topic.id}`} className="space-y-5 border-t border-line-2 px-3 sm:px-5">
          {(topic.context || !readOnly) && (
            <section>
              <p className="eyebrow mb-1">Contexto</p>
              <EditableText
                as="p"
                multiline
                value={topic.context}
                onCommit={(context) => patch({ context })}
                placeholder="Añadir contexto del tema (opcional)"
                ariaLabel="Contexto del tema"
                disabled={readOnly}
                className="w-full text-sm text-ink-2"
              />
            </section>
          )}

          {(topic.decisions.length > 0 || !readOnly) && (
            <section>
              <p className="eyebrow mb-1.5">Decisiones clave</p>
              {topic.decisions.length > 0 && (
                <ul className="space-y-1.5">
                  {topic.decisions.map((decision) => (
                    <li key={decision.id} className="flex items-start gap-2 rounded-lg bg-info-soft/70 px-3 py-2 text-sm text-ink">
                      <Diamond className="mt-1 size-3.5 shrink-0 text-info" aria-hidden />
                      <EditableText
                        multiline
                        value={decision.body}
                        onCommit={(body) => onAction({ type: "patchDecision", topicId: topic.id, decisionId: decision.id, body })}
                        placeholder="Escribe la decisión"
                        ariaLabel="Decisión clave"
                        disabled={readOnly}
                        autoEdit={freshId === decision.id}
                        className="min-w-0 flex-1"
                      />
                      {!readOnly && (
                        <Tooltip content="Quitar decisión">
                          <Button variant="ghost" size="icon-sm" aria-label="Quitar decisión" className="-my-1 -mr-1 size-7 shrink-0" onClick={() => onDialog({ kind: "deleteDecision", topicId: topic.id, decisionId: decision.id, body: decision.body })}>
                            <X />
                          </Button>
                        </Tooltip>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!readOnly && (
                <Button variant="ghost" size="sm" className="-ml-2 mt-1" onClick={() => onAction({ type: "addDecision", topicId: topic.id, id: uid(), body: "" })}>
                  <Plus /> Añadir decisión
                </Button>
              )}
            </section>
          )}

          <section>
            <p className="eyebrow mb-2">Puntos</p>
            {puntos.length > 0 ? (
              <div className="space-y-3">
                {puntos.map((punto) => (
                  <PuntoBlock key={punto.id} topic={topic} punto={punto} {...shared} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-3">
                {hiddenPuntos > 0 ? "Todos los puntos de este tema están cerrados u ocultos por el filtro." : "Este tema no tiene puntos todavía."}
              </p>
            )}
            {hiddenPuntos > 0 && filters.scope === "open" && (
              <p className="mt-2 text-xs text-ink-3">
                {plural(hiddenPuntos, "punto cerrado oculto", "puntos cerrados ocultos")} ·{" "}
                <button type="button" className="text-navy-2 underline-offset-4 hover:underline" onClick={shared.onShowAll}>
                  ver todos
                </button>
              </p>
            )}
            {!readOnly && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => onAction({ type: "addPunto", topicId: topic.id, id: uid() })}>
                <Plus /> Agregar punto
              </Button>
            )}
          </section>
        </CardBody>
      )}
    </Card>
  );
}

function PuntoBlock({ topic, punto, doc, asOf, filters, readOnly, freshId, onAction, onDialog, onShowAll }: Shared & { topic: Topic; punto: Punto }) {
  const [actaOpen, setActaOpen] = useState(false);
  const target = { topicId: topic.id, puntoId: punto.id };
  const visible = punto.pendientes.filter((item) => matchesFilters(doc, item, filters, asOf));
  const hidden = punto.pendientes.length - visible.length;
  const closed = punto.pendientes.filter((item) => !isOpen(item)).length;
  const total = punto.pendientes.length;
  const red = punto.pendientes.some((item) => isOpen(item) && carryCount(doc, item) >= 2);
  const patch = (fields: Partial<Pick<Punto, "title" | "subtitle" | "context">>) => onAction({ type: "patchPunto", ...target, patch: fields });

  return (
    <div className="rounded-lg border border-line-2 bg-surface-2/60 p-3 sm:p-4" data-punto={punto.id}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <EditableText
            as="h3"
            value={punto.title}
            onCommit={(title) => patch({ title })}
            placeholder="Nombre del punto"
            ariaLabel="Nombre del punto"
            disabled={readOnly}
            autoEdit={freshId === punto.id}
            className="w-full font-sans text-sm font-semibold text-ink"
          />
          {(punto.subtitle || !readOnly) && (
            <EditableText
              as="p"
              value={punto.subtitle}
              onCommit={(subtitle) => patch({ subtitle })}
              placeholder="Subtítulo (opcional)"
              ariaLabel="Subtítulo del punto"
              disabled={readOnly}
              className="mt-0.5 w-full text-xs text-ink-3"
            />
          )}
        </div>
        {total > 0 && (
          <Tooltip content={`${closed} de ${total} ${total === 1 ? "pendiente cerrado" : "pendientes cerrados"}${red ? " · hay pendientes arrastrados" : ""}`}>
            <Badge tone={red ? "danger" : closed === total ? "ok" : "neutral"} tabIndex={0} className="num shrink-0">
              {closed}/{total}
            </Badge>
          </Tooltip>
        )}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Más acciones del punto" className="-mr-1 -mt-1 shrink-0">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onDialog({ kind: "link", target, current: punto.leadImportKey })}>
                <Link2 /> {punto.leadImportKey ? "Cambiar oportunidad vinculada" : "Vincular oportunidad"}
              </DropdownMenuItem>
              {punto.leadImportKey && (
                <DropdownMenuItem onSelect={() => onAction({ type: "linkPunto", ...target, leadImportKey: null })}>
                  <Unlink /> Quitar vínculo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onDialog({ kind: "attach", target })}>
                <Paperclip /> Anexar enlace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => onDialog({ kind: "deletePunto", target, title: punto.title, count: total })}>
                <Trash /> Eliminar punto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {(punto.context || !readOnly) && (
        <EditableText
          as="p"
          multiline
          value={punto.context}
          onCommit={(context) => patch({ context })}
          placeholder="Contexto y acuerdos (lo que no es tarea)"
          ariaLabel="Contexto del punto"
          disabled={readOnly}
          className="mt-2 w-full text-sm text-ink-2"
        />
      )}

      {(punto.leadImportKey || punto.links.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {punto.leadImportKey && (
            <Tooltip content="Abrir la oportunidad en el pipeline">
              <Link href={`/pipeline?lead=${encodeURIComponent(punto.leadImportKey)}`} className={cn(badgeVariants({ tone: "info" }), "hover:underline")}>
                <Link2 className="size-3" /> Oportunidad vinculada
              </Link>
            </Tooltip>
          )}
          {punto.links.map((link) => (
            <span key={link.id} className={cn(badgeVariants({ tone: "outline" }), "gap-1 pr-1")}>
              <Paperclip className="size-3 text-ink-3" aria-hidden />
              {link.url ? (
                <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-navy-2 underline-offset-2 hover:underline">
                  {link.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                link.label
              )}
              {!readOnly && (
                <Tooltip content="Quitar enlace">
                  <button type="button" aria-label={`Quitar enlace ${link.label}`} className="rounded-full p-0.5 text-ink-3 hover:bg-accent-soft hover:text-ink" onClick={() => onAction({ type: "deleteLink", ...target, linkId: link.id })}>
                    <X className="size-3" />
                  </button>
                </Tooltip>
              )}
            </span>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <div className="mt-3 space-y-2">
          {visible.map((item) => (
            <PendienteRow key={item.id} doc={doc} topic={topic} punto={punto} item={item} asOf={asOf} readOnly={readOnly} fresh={freshId === item.id} onAction={onAction} onDialog={onDialog} />
          ))}
        </div>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          {plural(hidden, "pendiente oculto", "pendientes ocultos")} por el filtro
          {filters.scope === "open" && !filters.person && !filters.focus && (
            <>
              {" · "}
              <button type="button" className="text-navy-2 underline-offset-4 hover:underline" onClick={onShowAll}>
                ver cerrados
              </button>
            </>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!readOnly && (
          <Button variant="soft" size="sm" onClick={() => onAction({ type: "addPendiente", ...target, id: uid() })}>
            <Plus /> Nuevo pendiente
          </Button>
        )}
        {!readOnly && (
          <Button variant="ghost" size="sm" onClick={() => onDialog({ kind: "attach", target })}>
            <Paperclip /> Anexar enlace
          </Button>
        )}
        {punto.acta && (
          <button
            type="button"
            aria-expanded={actaOpen}
            onClick={() => setActaOpen((value) => !value)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", actaOpen && "rotate-90")} aria-hidden />
            <FileText className="size-3.5" aria-hidden /> Texto original del acta
          </button>
        )}
      </div>
      {punto.acta && actaOpen && <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line-2 bg-surface p-3 font-sans text-xs leading-relaxed text-ink-2">{punto.acta}</pre>}
    </div>
  );
}
