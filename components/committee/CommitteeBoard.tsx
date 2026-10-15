"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Calendar, ChevronDown, Link2, Mail, Plus, X } from "lucide-react";
import { buildCommitteeEmail } from "@/lib/committee/email";
import { carryCount, carryTone, isOpen, matchesPerson, personStats, puntoHasOpen, topicIsClosed, topicStats, boardStats } from "@/lib/committee/metrics";
import { applyAction } from "@/lib/committee/mutate";
import type { CommitteeAction, CommitteeDoc, Pendiente, Punto, Topic } from "@/lib/committee/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, longDate, shortDate, todayIso, uid } from "@/lib/utils";

const TAGS = ["Operaciones", "Logística", "IT", "Mercadeo", "Finanzas"];
const STATUSES = [
  { id: "pendiente", label: "Pendiente" },
  { id: "en_curso", label: "En curso" },
  { id: "cerrado", label: "Cerrado" },
] as const;

type HistoryRow = { number: number; held_on: string; is_current: number; snapshot: boolean };

export function CommitteeBoard({ initialDoc, history }: { initialDoc: CommitteeDoc; history: HistoryRow[] }) {
  const [doc, setDoc] = useState(initialDoc);
  const [archive, setArchive] = useState<CommitteeDoc[]>([]);
  const [menu, setMenu] = useState(history);
  const [viewing, setViewing] = useState(initialDoc.committee.number);
  const [showClosed, setShowClosed] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const [nextDate, setNextDate] = useState(todayIso());
  const [linkFor, setLinkFor] = useState<{ topicId: string; puntoId: string; pendienteId?: string } | null>(null);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const queue = useRef(Promise.resolve());
  const asOf = todayIso();
  const live = viewing === doc.committee.number;
  const snapshot = archive.find((item) => item.committee.number === viewing);
  const cohort = !live && !snapshot;
  const shown = live ? doc : snapshot ?? doc;
  const readOnly = !live;

  function commit(action: CommitteeAction) {
    if (readOnly) return;
    setDoc((current) => applyAction(current, action));
    setSave("saving");
    queue.current = queue.current.then(async () => {
      const response = await fetch("/api/committee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) {
        setSave("error");
        return;
      }
      const payload = (await response.json()) as { doc: CommitteeDoc; history: HistoryRow[] };
      if (action.type === "newCommittee") {
        setArchive((items) => [...items, doc]);
        setDoc(payload.doc);
        setMenu(payload.history);
        setViewing(payload.doc.committee.number);
      }
      setSave("saved");
    });
  }

  const stats = boardStats(shown, asOf);
  const people = personStats(shown, asOf);
  const closedCount = stats.closed;
  const openTopics = shown.topics.filter((topic) => !topicIsClosed(topic)).sort((a, b) => a.number - b.number);
  const closedTopics = shown.topics.filter((topic) => topicIsClosed(topic)).sort((a, b) => a.number - b.number);

  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <section className="rounded-3xl bg-[var(--navy)] px-5 py-5 text-white shadow-sm sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[11px] tracking-[0.18em] text-white/60">
              {shown.committee.area} · {cohort ? "COHORTE" : "COMITÉ"} #{cohort ? viewing : shown.committee.number}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setEmailOpen(true)} disabled={!live}>
                <Mail className="h-4 w-4" /> Correo resumen
              </Button>
              <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={() => setNextOpen(true)} disabled={readOnly}>
                <Plus className="h-4 w-4" /> Nuevo comité
              </Button>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <span className={cn("h-1.5 w-1.5 rounded-full", save === "error" ? "bg-rose-400" : "bg-emerald-400")} />
                {save === "saving" ? "Guardando" : save === "error" ? "Error al guardar" : "Guardado"}
              </span>
            </div>
          </div>
          <input
            className="mt-1 w-full bg-transparent font-serif text-4xl text-white outline-none"
            value={shown.committee.title}
            disabled={readOnly}
            onChange={(event) => commit({ type: "patchCommittee", patch: { title: event.target.value } })}
          />
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/10 px-3 py-1">{longDate(cohort ? (menu.find((item) => item.number === viewing)?.held_on ?? shown.committee.heldOn) : shown.committee.heldOn)}</span>
            <span className="rounded-full bg-white/10 px-3 py-1">{stats.open} abiertos</span>
            <span className="rounded-full bg-rose-500/90 px-3 py-1">{stats.overdue} vencidos</span>
            <span className="rounded-full bg-rose-500/90 px-3 py-1">{stats.carried} con 2+ comités</span>
            <select
              className="rounded-full bg-white/10 px-3 py-1 outline-none"
              value={viewing}
              onChange={(event) => setViewing(Number(event.target.value))}
            >
              {menu.map((item) => (
                <option key={item.number} value={item.number} className="text-black">
                  Comité #{item.number} · {shortDate(item.held_on)}
                  {item.is_current ? " · actual" : item.snapshot ? "" : " · cohorte"}
                </option>
              ))}
            </select>
          </div>
        </section>

        {!live && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {cohort
              ? `Cohorte del ${shortDate(menu.find((item) => item.number === viewing)?.held_on ?? "")}. El acta completa empieza en el comité #7; aquí está lo que nació en esa fecha.`
              : "Estás viendo un comité anterior, solo lectura."}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={!person} onClick={() => setPerson(null)}>Todos</FilterChip>
          {people.map((item) => (
            <FilterChip key={item.key} active={person === item.key} alert={item.overdue > 0 || item.carried > 0} onClick={() => setPerson(item.key)}>
              {item.name} {item.open}
            </FilterChip>
          ))}
          <button className="ml-auto text-sm text-[var(--blue)]" onClick={() => setShowClosed((value) => !value)}>
            {showClosed ? "Ocultar cerrados" : `Ver cerrados (${closedCount})`}
          </button>
        </div>

        {cohort && <CohortList doc={doc} number={viewing} asOf={asOf} />}
        {!cohort && openTopics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} doc={shown} asOf={asOf} person={person} showClosed={showClosed} readOnly={readOnly} onAction={commit} onLink={setLinkFor} />
        ))}
        {!cohort && showClosed && closedTopics.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold tracking-[0.16em] text-[#98a2b3]">TEMAS CERRADOS</h2>
            {closedTopics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} doc={shown} asOf={asOf} person={person} showClosed onLink={setLinkFor} readOnly={readOnly} onAction={commit} />
            ))}
          </div>
        )}
        {!readOnly && (
          <button className="w-full rounded-2xl border border-dashed border-[#cfd5e4] py-3 text-sm text-[#667085]" onClick={() => commit({ type: "addTopic", id: uid() })}>
            + Nuevo tema
          </button>
        )}
        <div className="flex gap-3 text-sm">
          <a className="text-[var(--blue)]" href="/api/committee/export?format=csv">Exportar CSV</a>
          <a className="text-[var(--blue)]" href="/api/committee/export?format=json">Exportar JSON</a>
          <Link className="text-[var(--blue)]" href="/comites/comparar">Comparar comités</Link>
        </div>
      </div>

      <aside className="h-max rounded-3xl bg-white p-4 shadow-sm lg:sticky lg:top-20">
        <h2 className="font-semibold">Pendientes por persona</h2>
        <p className="mb-3 text-xs text-[#667085]">Clic en un nombre para ver solo lo suyo.</p>
        <div className="space-y-1">
          {people.map((item) => (
            <button key={item.key} onClick={() => setPerson(person === item.key ? null : item.key)} className={cn("flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-sm", person === item.key && "bg-[#eef2ff]")}>
              <span>{item.name} <span className="text-[#667085]">{item.open}</span></span>
              <span className="flex gap-1 text-[11px]">
                {item.overdue > 0 && <span className="text-rose-600">{item.overdue} venc.</span>}
                {item.carried > 0 && <span className="rounded-full bg-rose-50 px-1.5 text-rose-600">{item.carried} arrastr.</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-xs text-[#667085]">
          <p className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> 1 comité sin resolver</p>
          <p className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> 2+ comités sin resolver</p>
          <p className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm border border-rose-500" /> Fecha vencida</p>
        </div>
        <Button className="mt-4 w-full" variant="outline" onClick={() => setEmailOpen(true)}>Redactar correo del comité</Button>
      </aside>

      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} doc={shown} asOf={asOf} />
      <Dialog open={nextOpen} onOpenChange={setNextOpen}>
        <DialogContent className="p-6">
          <DialogTitle>Nuevo comité</DialogTitle>
          <p className="mt-2 text-sm text-[#667085]">Los pendientes abiertos pasan al comité nuevo y suman un comité de arrastre. Los cerrados quedan en el historial.</p>
          <label className="mt-4 block text-sm">Fecha
            <Input className="mt-1" type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} />
          </label>
          <Button className="mt-4" onClick={() => { commit({ type: "newCommittee", heldOn: nextDate }); setNextOpen(false); }}>Crear comité</Button>
        </DialogContent>
      </Dialog>
      <LeadLinker open={!!linkFor} onOpenChange={(open) => !open && setLinkFor(null)} onPick={(key) => {
        if (!linkFor) return;
        if (linkFor.pendienteId) commit({ type: "patchPendiente", ...linkFor, pendienteId: linkFor.pendienteId, patch: { leadImportKey: key } });
        else commit({ type: "linkPunto", topicId: linkFor.topicId, puntoId: linkFor.puntoId, leadImportKey: key });
        setLinkFor(null);
      }} />
    </div>
  );
}

function CohortList({ doc, number, asOf }: { doc: CommitteeDoc; number: number; asOf: string }) {
  const rows = doc.topics.flatMap((topic) =>
    topic.puntos.flatMap((punto) =>
      punto.pendientes
        .filter((item) => item.bornCommitteeNumber === number)
        .map((item) => ({ topic, punto, item, open: isOpen(item), overdue: isOpen(item) && !!item.dueOn && item.dueOn < asOf })),
    ),
  );
  if (!rows.length) return <p className="rounded-2xl bg-white p-4 text-sm text-[#667085]">No hay pendientes nacidos en este comité dentro del tablero actual.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.item.id} className="rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
          <p className="text-xs text-[#667085]">{row.topic.title} · {row.punto.title}</p>
          <p className={cn("font-medium", !row.open && "line-through text-[#98a2b3]")}>{row.item.title || "(sin título)"}</p>
          <p className="text-xs text-[#667085]">{row.item.owners.join(", ") || "Sin responsable"} · {row.item.dueOn ? shortDate(row.item.dueOn) : "Sin fecha"}{row.overdue ? " · Vencido" : ""} · {row.open ? "Abierto" : "Cerrado"}</p>
        </div>
      ))}
    </div>
  );
}

function FilterChip({ active, alert, children, onClick }: { active?: boolean; alert?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("rounded-full border bg-white px-3 py-1 text-sm", active ? "border-[var(--navy)] bg-[var(--navy)] text-white" : alert ? "border-rose-300 text-rose-700" : "border-[#e1e5ef]")}>
      {children}
    </button>
  );
}

function TopicCard({ topic, doc, asOf, person, showClosed, readOnly, onAction, onLink }: {
  topic: Topic; doc: CommitteeDoc; asOf: string; person: string | null; showClosed: boolean; readOnly: boolean;
  onAction: (action: CommitteeAction) => void;
  onLink: (target: { topicId: string; puntoId: string; pendienteId?: string }) => void;
}) {
  const stats = topicStats(doc, topic);
  const puntos = topic.puntos.filter((punto) => {
    if (person && !punto.pendientes.some((item) => matchesPerson(item, person) && (showClosed || isOpen(item)))) return false;
    if (!showClosed && punto.pendientes.length > 0 && !puntoHasOpen(punto)) return false;
    return true;
  });
  if (person && puntos.length === 0) return null;
  return (
    <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <input disabled={readOnly} className="w-12 bg-transparent text-3xl font-semibold outline-none" type="number" value={topic.number} onChange={(event) => onAction({ type: "patchTopic", topicId: topic.id, patch: { number: Number(event.target.value) } })} />
        <div className="min-w-0 flex-1">
          <input disabled={readOnly} className="w-full bg-transparent text-xl font-semibold outline-none" value={topic.title} onChange={(event) => onAction({ type: "patchTopic", topicId: topic.id, patch: { title: event.target.value } })} />
          <textarea disabled={readOnly} className="mt-1 w-full resize-none bg-transparent text-sm text-[#667085] outline-none" rows={topic.context ? 2 : 1} placeholder="Contexto del tema (opcional)" value={topic.context} onChange={(event) => onAction({ type: "patchTopic", topicId: topic.id, patch: { context: event.target.value } })} />
        </div>
        <label className="flex items-center gap-1 rounded-full border border-[#e6e8ef] px-2 py-1 text-sm">
          <input disabled={readOnly} className="w-12 bg-transparent text-right outline-none" type="number" value={topic.minutes ?? ""} placeholder="min" onChange={(event) => onAction({ type: "patchTopic", topicId: topic.id, patch: { minutes: event.target.value === "" ? null : Number(event.target.value) } })} />
          min
          {!readOnly && <button onClick={() => onAction({ type: "patchTopic", topicId: topic.id, patch: { minutes: null } })} aria-label="Quitar tiempo"><X className="h-3.5 w-3.5" /></button>}
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TAGS.map((tag) => {
          const on = topic.tags.includes(tag);
          return (
            <button key={tag} disabled={readOnly} onClick={() => onAction({ type: "patchTopic", topicId: topic.id, patch: { tags: on ? topic.tags.filter((item) => item !== tag) : [...topic.tags, tag] } })} className={cn("rounded-full px-2 py-0.5 text-[11px] tracking-wide", on ? "bg-[#eef2ff] text-[#3146b5]" : "border border-dashed border-[#d5d9e4] text-[#98a2b3]")}>
              {tag.toUpperCase()}
            </button>
          );
        })}
        {topicIsClosed(topic) && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">CERRADO</span>}
        <span className="ml-auto text-sm text-[#667085]">{stats.open} {stats.open === 1 ? "abierto" : "abiertos"}{stats.carried > 0 && <> · <span className="text-rose-600">{stats.carried} {stats.carried === 1 ? "arrastrado" : "arrastrados"}</span></>}</span>
      </div>
      {topic.decisions.map((decision) => (
        <div key={decision.id} className="mt-3 rounded-2xl bg-[#f4f7ff] p-3 text-sm">
          <textarea disabled={readOnly} className="w-full bg-transparent outline-none" value={decision.body} onChange={(event) => onAction({ type: "patchDecision", topicId: topic.id, decisionId: decision.id, body: event.target.value })} />
        </div>
      ))}
      {!readOnly && <button className="mt-3 text-sm text-[var(--blue)]" onClick={() => onAction({ type: "addDecision", topicId: topic.id, id: uid(), body: "" })}>◆ + Decisión clave</button>}
      <div className="mt-3 space-y-3">
        {puntos.map((punto) => (
          <PuntoCard key={punto.id} punto={punto} topic={topic} doc={doc} asOf={asOf} person={person} showClosed={showClosed} readOnly={readOnly} onAction={onAction} onLink={onLink} />
        ))}
      </div>
      {!readOnly && <button className="mt-3 text-sm text-[#667085]" onClick={() => onAction({ type: "addPunto", topicId: topic.id, id: uid() })}>+ Agregar punto</button>}
    </article>
  );
}

function PuntoCard({ punto, topic, doc, asOf, person, showClosed, readOnly, onAction, onLink }: {
  punto: Punto; topic: Topic; doc: CommitteeDoc; asOf: string; person: string | null; showClosed: boolean; readOnly: boolean;
  onAction: (action: CommitteeAction) => void;
  onLink: (target: { topicId: string; puntoId: string; pendienteId?: string }) => void;
}) {
  const [actaOpen, setActaOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const visible = punto.pendientes.filter((item) => matchesPerson(item, person) && (showClosed || isOpen(item)));
  const hidden = punto.pendientes.filter((item) => !showClosed && !isOpen(item)).length;
  const closed = punto.pendientes.filter((item) => !isOpen(item)).length;
  const total = punto.pendientes.length;
  const red = punto.pendientes.some((item) => isOpen(item) && carryCount(doc, item) >= 2);
  return (
    <div className="rounded-2xl border border-[#eceff5] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input disabled={readOnly} className="w-full bg-transparent font-medium outline-none" placeholder="Nombre del punto" value={punto.title} onChange={(event) => onAction({ type: "patchPunto", topicId: topic.id, puntoId: punto.id, patch: { title: event.target.value } })} />
          <input disabled={readOnly} className="mt-1 w-full bg-transparent text-sm text-[#667085] outline-none" placeholder="Subtítulo" value={punto.subtitle} onChange={(event) => onAction({ type: "patchPunto", topicId: topic.id, puntoId: punto.id, patch: { subtitle: event.target.value } })} />
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", red ? "border-rose-400 text-rose-600" : "border-[#e4e7ef] text-[#667085]")}>{closed}/{total}</span>
        {!readOnly && <button onClick={() => onAction({ type: "deletePunto", topicId: topic.id, puntoId: punto.id })} aria-label="Eliminar punto"><X className="h-4 w-4 text-[#98a2b3]" /></button>}
      </div>
      <textarea disabled={readOnly} className="mt-2 w-full resize-none rounded-xl bg-[#f8f9fc] p-2 text-sm outline-none" rows={2} placeholder="Contexto y acuerdos (lo que no es tarea)" value={punto.context} onChange={(event) => onAction({ type: "patchPunto", topicId: topic.id, puntoId: punto.id, patch: { context: event.target.value } })} />
      {punto.leadImportKey && <p className="mt-2 text-xs text-[var(--blue)]">Vinculado a una oportunidad del CRM</p>}
      <div className="mt-2 space-y-2">
        {visible.map((item) => (
          <PendienteRow key={item.id} item={item} topic={topic} punto={punto} doc={doc} asOf={asOf} readOnly={readOnly} onAction={onAction} onLink={() => onLink({ topicId: topic.id, puntoId: punto.id, pendienteId: item.id })} />
        ))}
      </div>
      {hidden > 0 && <p className="mt-2 text-xs text-[#98a2b3]">{hidden} pendiente{hidden === 1 ? "" : "s"} cerrado{hidden === 1 ? "" : "s"} oculto{hidden === 1 ? "" : "s"}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        {!readOnly && <button className="text-[var(--blue)]" onClick={() => onAction({ type: "addPendiente", topicId: topic.id, puntoId: punto.id, id: uid() })}>+ Pendiente</button>}
        {!readOnly && <button className="text-[var(--blue)]" onClick={() => setLinkOpen(true)}>+ Anexar link</button>}
        {!readOnly && <button className="text-[#667085]" onClick={() => onLink({ topicId: topic.id, puntoId: punto.id })}>Vincular oportunidad</button>}
      </div>
      {punto.links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {punto.links.map((link) => (
            <span key={link.id} className="inline-flex items-center gap-1 rounded-full bg-[#f4f6fb] px-2 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5" /> {link.url ? <a href={link.url} className="underline">{link.label}</a> : link.label}
              {!readOnly && <button onClick={() => onAction({ type: "deleteLink", topicId: topic.id, puntoId: punto.id, linkId: link.id })} aria-label="Quitar enlace"><X className="h-3 w-3" /></button>}
            </span>
          ))}
        </div>
      )}
      {punto.acta && (
        <div className="mt-2">
          <button className="text-xs tracking-wide text-[#98a2b3]" onClick={() => setActaOpen((value) => !value)}>{actaOpen ? "▾" : "▸"} TEXTO ORIGINAL DEL ACTA</button>
          {actaOpen && <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[#f8f9fc] p-3 text-xs text-[#475467]">{punto.acta}</pre>}
        </div>
      )}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="p-6">
          <DialogTitle>Anexar link</DialogTitle>
          <Input className="mt-3" placeholder="Nombre" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Input className="mt-2" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Button className="mt-3" onClick={() => { onAction({ type: "addLink", topicId: topic.id, puntoId: punto.id, id: uid(), label, url }); setLinkOpen(false); setLabel(""); setUrl(""); }}>Agregar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendienteRow({ item, topic, punto, doc, asOf, readOnly, onAction, onLink }: {
  item: Pendiente; topic: Topic; punto: Punto; doc: CommitteeDoc; asOf: string; readOnly: boolean;
  onAction: (action: CommitteeAction) => void; onLink: () => void;
}) {
  const carry = carryCount(doc, item);
  const tone = carryTone(carry);
  const overdue = isOpen(item) && !!item.dueOn && item.dueOn < asOf;
  const label = carry <= 0 ? `Nuevo · ${shortDate(item.bornOn)}` : carry === 1 ? `1 comité · ${shortDate(item.bornOn)}` : `${carry} comités · ${shortDate(item.bornOn)}`;
  return (
    <div className={cn("rounded-xl border p-2", tone === "red" ? "border-rose-200 bg-rose-50" : tone === "amber" ? "border-amber-200 bg-amber-50/60" : "border-[#eef0f5]", item.status === "cerrado" && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <select disabled={readOnly} value={item.status} onChange={(event) => onAction({ type: "patchPendiente", topicId: topic.id, puntoId: punto.id, pendienteId: item.id, patch: { status: event.target.value as Pendiente["status"] } })} className={cn("rounded-full border bg-white px-2 py-1 text-xs", item.status === "en_curso" ? "border-lime-500 text-lime-800" : item.status === "cerrado" ? "border-emerald-500 text-emerald-800" : "border-amber-400 text-amber-800")}>
          {STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
        </select>
        <input disabled={readOnly} className={cn("min-w-[180px] flex-1 bg-transparent text-sm outline-none", item.status === "cerrado" && "line-through")} placeholder="¿Qué hay que hacer?" value={item.title} onChange={(event) => onAction({ type: "patchPendiente", topicId: topic.id, puntoId: punto.id, pendienteId: item.id, patch: { title: event.target.value } })} />
        {!readOnly && <button onClick={() => onAction({ type: "deletePendiente", topicId: topic.id, puntoId: punto.id, pendienteId: item.id })} aria-label="Eliminar pendiente"><X className="h-4 w-4 text-[#98a2b3]" /></button>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <OwnerPicker people={doc.people.map((person) => person.name)} owners={item.owners} disabled={readOnly} onChange={(owners) => onAction({ type: "setOwners", topicId: topic.id, puntoId: punto.id, pendienteId: item.id, owners })} />
        <input disabled={readOnly} type="date" value={item.dueOn ?? ""} onChange={(event) => onAction({ type: "patchPendiente", topicId: topic.id, puntoId: punto.id, pendienteId: item.id, patch: { dueOn: event.target.value || null } })} className={cn("rounded-lg border bg-white px-2 py-1 text-xs", overdue && "border-rose-500 text-rose-700")} />
        {overdue && <span className="text-[11px] font-semibold text-rose-600">VENCIDO</span>}
        <select disabled={readOnly} value={item.bornCommitteeNumber} onChange={(event) => onAction({ type: "patchPendiente", topicId: topic.id, puntoId: punto.id, pendienteId: item.id, patch: { bornCommitteeNumber: Number(event.target.value) } })} className={cn("rounded-full border px-2 py-1 text-xs", tone === "red" ? "border-rose-500 bg-rose-600 text-white" : tone === "amber" ? "border-amber-400 text-amber-800" : "border-[#d5d9e4] bg-white")}>
          {doc.calendar.filter((entry) => entry.number <= doc.committee.number).map((entry) => {
            const age = doc.committee.number - entry.number;
            const text = age <= 0 ? `Nuevo · ${shortDate(entry.heldOn)}` : `${age} ${age === 1 ? "comité" : "comités"} · ${shortDate(entry.heldOn)}`;
            return <option key={entry.number} value={entry.number}>{text}</option>;
          })}
        </select>
        <span className="sr-only">{label}</span>
        <button className="text-[#667085]" onClick={onLink} aria-label="Vincular oportunidad"><Link2 className="h-4 w-4" /></button>
        {item.leadImportKey && <span className="text-[11px] text-[var(--blue)]">CRM</span>}
      </div>
    </div>
  );
}

function OwnerPicker({ people, owners, disabled, onChange }: { people: string[]; owners: string[]; disabled: boolean; onChange: (owners: string[]) => void }) {
  const [adding, setAdding] = useState("");
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs">
        {owners.length === 0 && <span className="rounded-full border border-dashed px-2 py-1 text-[#98a2b3]">Responsable</span>}
        {owners.map((owner) => <span key={owner} className="rounded-full bg-[var(--navy)] px-2 py-1 text-white">{owner}</span>)}
        <ChevronDown className="h-3.5 w-3.5 text-[#98a2b3]" />
      </summary>
      {!disabled && (
        <div className="absolute z-10 mt-1 w-52 rounded-xl border bg-white p-2 shadow-lg">
          {people.map((name) => (
            <label key={name} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={owners.includes(name)} onChange={(event) => onChange(event.target.checked ? [...owners, name] : owners.filter((owner) => owner !== name))} />
              {name}
            </label>
          ))}
          <div className="mt-2 flex gap-1">
            <input className="w-full rounded-lg border px-2 py-1 text-xs" placeholder="Agregar" value={adding} onChange={(event) => setAdding(event.target.value)} />
            <button className="text-xs text-[var(--blue)]" onClick={() => { if (adding.trim()) onChange([...owners, adding.trim()]); setAdding(""); }}>Ok</button>
          </div>
        </div>
      )}
    </details>
  );
}

function EmailDialog({ open, onOpenChange, doc, asOf }: { open: boolean; onOpenChange: (open: boolean) => void; doc: CommitteeDoc; asOf: string }) {
  const email = useMemo(() => buildCommitteeEmail(doc, asOf), [doc, asOf]);
  const [copied, setCopied] = useState("");
  async function copy(kind: "subject" | "body") {
    if (kind === "subject") await navigator.clipboard.writeText(email.subject);
    else {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([email.html], { type: "text/html" }),
          "text/plain": new Blob([email.text], { type: "text/plain" }),
        }),
      ]);
    }
    setCopied(kind);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <div className="border-b px-6 py-4">
          <p className="text-[11px] tracking-[0.16em] text-[#98a2b3]">CORREO DEL COMITÉ</p>
          <DialogTitle>Resumen listo para enviar</DialogTitle>
          <p className="text-sm text-[#667085]">Copia y pega en Outlook o Gmail: la tabla se mantiene. Este módulo no envía el correo.</p>
        </div>
        <div className="space-y-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-[#98a2b3]">ASUNTO</p>
              <p className="truncate rounded-xl border px-3 py-2 text-sm">{email.subject}</p>
            </div>
            <Button variant="outline" onClick={() => copy("subject")}>{copied === "subject" ? "Copiado" : "Copiar"}</Button>
          </div>
          <div className="max-h-[46vh] overflow-auto rounded-xl border p-4" dangerouslySetInnerHTML={{ __html: email.html }} />
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={() => copy("body")}>{copied === "body" ? "Copiado" : "Copiar correo con tabla"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadLinker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (key: string | null) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ import_key: string; name: string; customer: string; stage: string }[]>([]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6">
        <DialogTitle>Vincular oportunidad</DialogTitle>
        <Input className="mt-3" placeholder="Cliente u oportunidad" value={q} onChange={async (event) => {
          setQ(event.target.value);
          const response = await fetch(`/api/leads?q=${encodeURIComponent(event.target.value)}`);
          const payload = (await response.json()) as { leads: typeof rows };
          setRows(payload.leads);
        }} />
        <div className="mt-3 max-h-64 space-y-1 overflow-auto">
          {rows.map((row) => (
            <button key={row.import_key} className="block w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-[#f4f6fb]" onClick={() => onPick(row.import_key)}>
              <span className="font-medium">{row.customer || row.name}</span>
              <span className="block text-xs text-[#667085]">{row.name} · {row.stage}</span>
            </button>
          ))}
        </div>
        <button className="mt-3 text-sm text-[#667085]" onClick={() => onPick(null)}>Quitar vínculo</button>
      </DialogContent>
    </Dialog>
  );
}
