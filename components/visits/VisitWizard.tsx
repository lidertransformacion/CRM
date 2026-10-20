"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { SignaturePad } from "@/components/visits/SignaturePad";
import { compressImage } from "@/components/visits/media";
import {
  CAL,
  EQUIPMENT,
  EQUIPMENT_GROUPS,
  FREQ_DAYS,
  MILKS,
  OBJECTIVES,
  PLAN_OPTIONS,
  PROFILES,
  RESULT,
  SENSORY,
  SKILLS,
  SKILL_LEVELS,
  SKILL_SHORT,
  TEAM,
  TECH_EQUIPMENT,
  TECH_REASONS,
  TECH_STATUS,
  VISIT_TYPES,
  VISITOR_ROLES,
  fold,
  hasText,
  pendingText,
} from "@/lib/visits/catalog";
import { addDays, brewRatio, calOk, shortDate } from "@/lib/visits/calc";
import {
  applyPoint,
  assignMember,
  assignVisitNumber,
  blankVisit,
  clearMember,
  normalizeVisit,
  stepsFor,
  timeStamp,
  type VisitBrief,
  type VisitPoint,
  type VisitRecord,
} from "@/lib/visits/model";

const DRAFT_KEY = "crm_visit_draft";

const LEVEL_NAMES = SKILL_LEVELS;

function toggleValue(list: string[], value: string, exclusiveNone = false): string[] {
  const has = list.includes(value);
  if (exclusiveNone && value === "No requiere seguimiento" && !has) return ["No requiere seguimiento"];
  const next = has ? list.filter((item) => item !== value) : [...list, value];
  if (exclusiveNone && value !== "No requiere seguimiento") return next.filter((item) => item !== "No requiere seguimiento");
  return next;
}

export function VisitWizard({
  points,
  briefs,
  initial,
  editing,
  resumeDraft = false,
}: {
  points: VisitPoint[];
  briefs: VisitBrief[];
  initial: VisitRecord;
  editing: boolean;
  resumeDraft?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [visit, setVisit] = useState<VisitRecord>(initial);
  const [step, setStep] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(Boolean(initial.manual));
  const [ready, setReady] = useState(!resumeDraft);
  const [resumed, setResumed] = useState(false);
  const [saving, setSaving] = useState(false);
  const steps = stepsFor(visit, showAll);
  const current = steps[Math.min(step, steps.length - 1)];

  useEffect(() => {
    if (!resumeDraft) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { visit?: Partial<VisitRecord>; step?: number; showAll?: boolean };
        if (draft.visit?.cliente || draft.visit?.tipos?.length) {
          setVisit(normalizeVisit(draft.visit));
          setStep(draft.step || 0);
          setShowAll(Boolean(draft.showAll));
          setManual(Boolean(draft.visit.manual));
          setResumed(true);
        }
      }
    } catch {
      /* A broken draft should not block a new visit. */
    }
    setReady(true);
  }, [resumeDraft]);

  useEffect(() => {
    if (!ready || editing || !resumeDraft) return;
    const handle = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ visit, step, showAll }));
      } catch {
        /* The phone may refuse a draft that still holds large photos. */
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [visit, step, showAll, ready, editing, resumeDraft]);

  const matches = useMemo(() => {
    const words = fold(query).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return points
      .filter((point) => {
        const haystack = fold([point.tradeName, point.legalName, point.pointName, point.address, point.city, point.locality].join(" "));
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, 12);
  }, [points, query]);

  function choosePoint(point: VisitPoint) {
    setVisit((currentVisit) => applyPoint(currentVisit, point, briefs, editing));
    setManual(false);
    setQuery("");
  }

  async function persist(status: "borrador" | "final") {
    if (status === "final" && !hasText(visit.cliente)) {
      setStep(0);
      toast({ title: "Falta el cliente", description: "Elige el punto para poder finalizar.", tone: "warn" });
      return;
    }
    setSaving(true);
    const next: VisitRecord = {
      ...visit,
      status,
      horaOut: status === "final" && !visit.horaOut ? timeStamp() : visit.horaOut,
      numVisita: visit.numVisita || "1",
      updatedAt: Date.now(),
    };
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await response.json()) as { error?: string; visit?: VisitRecord };
      if (!response.ok || !body.visit) {
        toast({ title: "No se pudo guardar", description: body.error || "Inténtalo de nuevo.", tone: "danger" });
        return;
      }
      if (status === "final") {
        localStorage.removeItem(DRAFT_KEY);
        toast({ title: "Visita guardada", description: "El reporte ya está en el historial.", tone: "ok" });
        router.push(`/visitas/${body.visit.id}`);
        router.refresh();
        return;
      }
      setVisit(body.visit);
      toast({ title: "Borrador guardado", tone: "ok" });
    } catch {
      toast({ title: "Sin conexión", description: "El borrador sigue en este celular.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  function goNext() {
    if (current.id === "datos" && !hasText(visit.cliente)) {
      toast({ title: "Elige el cliente para continuar", tone: "warn" });
      return;
    }
    if (step < steps.length - 1) {
      setStep(step + 1);
      window.scrollTo(0, 0);
      return;
    }
    void persist("final");
  }

  const lastVisit = briefs
    .filter((brief) => brief.status === "final" && brief.id !== visit.id && fold(brief.cliente) === fold(visit.cliente) && fold(brief.sede) === fold(visit.sede))
    .map((brief) => brief.fecha || "")
    .sort()
    .pop();
  const frequencyDays = FREQ_DAYS[visit.planCli.fVis || ""];
  const siblings = visit.clienteId
    ? points.filter((point) => fold(point.tradeName) === fold(visit.cliente) && fold(point.legalName) === fold(visit.razonSocial) && point.id !== visit.clienteId)
    : [];

  return (
    <div className="pb-28">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Pasos">
        {steps.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            aria-current={item.id === current.id ? "step" : undefined}
            onClick={() => setStep(index)}
            className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium ${item.id === current.id ? "border-navy bg-navy text-crema" : index < step ? "border-line bg-surface text-ink" : "border-line bg-surface text-ink-3"}`}
          >
            {index + 1}. {item.name}
          </button>
        ))}
      </div>
      {resumed && (
        <p className="mb-3 rounded-md bg-amarillo px-3 py-2 text-sm text-ink">
          Retomaste un borrador de este celular.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY);
              setVisit(blankVisit());
              setStep(0);
              setResumed(false);
            }}
          >
            Descartar
          </button>
        </p>
      )}
      <Card>
        <CardBody className="space-y-5">
          {current.id === "datos" && (
            <Datos
              visit={visit}
              setVisit={setVisit}
              briefs={briefs}
              editing={editing}
              manual={manual}
              setManual={setManual}
              query={query}
              setQuery={setQuery}
              matches={matches}
              choosePoint={choosePoint}
              siblings={siblings}
              lastVisit={lastVisit}
              frequencyDays={frequencyDays}
              showAll={showAll}
              setShowAll={setShowAll}
            />
          )}
          {current.id === "tec" && <Tecnico visit={visit} setVisit={setVisit} />}
          {current.id === "cal" && <Calibracion visit={visit} setVisit={setVisit} />}
          {current.id === "equipo" && <Equipo visit={visit} setVisit={setVisit} />}
          {current.id === "capac" && <Capacitacion visit={visit} setVisit={setVisit} />}
          {current.id === "com" && <Comercial visit={visit} setVisit={setVisit} />}
          {current.id === "result" && <Resultado visit={visit} setVisit={setVisit} />}
          {current.id === "cierre" && <Cierre visit={visit} setVisit={setVisit} />}
        </CardBody>
      </Card>
      <div className="fixed inset-x-0 z-20 border-t border-line-2 bg-bg/95 px-4 py-3 backdrop-blur bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-[var(--sidebar-w)]">
        <div className="mx-auto flex max-w-[1280px] gap-2">
          <Button type="button" variant="secondary" className="flex-1" disabled={step === 0 || saving} onClick={() => { setStep(Math.max(0, step - 1)); window.scrollTo(0, 0); }}>
            Atrás
          </Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist("borrador")}>
            Borrador
          </Button>
          <Button type="button" className="flex-1" loading={saving} disabled={saving} onClick={goNext}>
            {step === steps.length - 1 ? "Finalizar" : "Siguiente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Choice({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip key={option} active={value === option} onClick={() => onChange(value === option ? "" : option)}>
          {option}
        </Chip>
      ))}
    </div>
  );
}

function Multi({ options, value, onChange, exclusiveNone = false }: { options: readonly string[]; value: string[]; onChange: (next: string[]) => void; exclusiveNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip key={option} active={value.includes(option)} onClick={() => onChange(toggleValue(value, option, exclusiveNone))}>
          {option}
        </Chip>
      ))}
    </div>
  );
}

function Tags({ value, placeholder, onChange }: { value: string[]; placeholder: string; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const next = text.trim();
              if (!next) return;
              onChange([...value, next]);
              setText("");
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const next = text.trim();
            if (!next) return;
            onChange([...value, next]);
            setText("");
          }}
        >
          Agregar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((item, index) => (
          <Chip key={`${item}-${index}`} active onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
            {item} ×
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Datos(props: {
  visit: VisitRecord;
  setVisit: (update: (visit: VisitRecord) => VisitRecord) => void;
  briefs: VisitBrief[];
  editing: boolean;
  manual: boolean;
  setManual: (value: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
  matches: VisitPoint[];
  choosePoint: (point: VisitPoint) => void;
  siblings: VisitPoint[];
  lastVisit?: string;
  frequencyDays?: number;
  showAll: boolean;
  setShowAll: (value: boolean) => void;
}) {
  const { visit, setVisit } = props;
  const staff = [...TEAM].sort((a, b) => Number(b.role === visit.visitante) - Number(a.role === visit.visitante));
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Datos de la visita</h2>
        <p className="mt-1 text-sm text-ink-2">Busca el cliente y el punto. La razón social, la dirección y el plan se llenan solos.</p>
      </header>
      <FieldSection title="¿Quién realiza la visita?">
        <div className="grid grid-cols-3 gap-2">
          {VISITOR_ROLES.map((role) => (
            <Button key={role} type="button" variant={visit.visitante === role ? "primary" : "secondary"} onClick={() => setVisit((current) => ({ ...current, visitante: role }))}>
              {role}
            </Button>
          ))}
        </div>
        {visit.visitante === "Técnico" && (
          <FieldGrid>
            <Field label="Nombre del técnico" htmlFor="tecnico">
              <Input id="tecnico" value={visit.tecnico} onChange={(event) => setVisit((current) => ({ ...current, tecnico: event.target.value }))} />
            </Field>
            <Field label="Empresa del técnico" htmlFor="tecnicoEmpresa">
              <Input id="tecnicoEmpresa" value={visit.tecnicoEmpresa} onChange={(event) => setVisit((current) => ({ ...current, tecnicoEmpresa: event.target.value }))} />
            </Field>
          </FieldGrid>
        )}
        <p className="text-xs font-medium text-ink-2">{visit.visitante === "Técnico" ? "Diligenciado por" : "¿Quién elabora el reporte?"}</p>
        <div className="flex flex-wrap gap-2">
          {staff.map((member) => (
            <Chip key={member.id} active={visit.respId === member.id} onClick={() => setVisit((current) => (current.respId === member.id ? clearMember(current) : assignMember(current, member)))}>
              {member.name}
            </Chip>
          ))}
          <Chip
            active={visit.respId === "otro"}
            onClick={() => setVisit((current) => ({ ...clearMember(current), respId: current.respId === "otro" ? "" : "otro" }))}
          >
            Otra persona
          </Chip>
        </div>
        {visit.respId === "otro" && (
          <FieldGrid>
            <Field label="Nombre" htmlFor="responsable">
              <Input id="responsable" value={visit.responsable} onChange={(event) => setVisit((current) => ({ ...current, responsable: event.target.value }))} />
            </Field>
            <Field label="Cargo" htmlFor="respCargo">
              <Input id="respCargo" value={visit.respCargo} onChange={(event) => setVisit((current) => ({ ...current, respCargo: event.target.value }))} />
            </Field>
          </FieldGrid>
        )}
      </FieldSection>
      <FieldSection title="Cliente">
        {props.manual ? (
          <div className="space-y-3">
            <button type="button" className="text-sm font-medium text-navy underline" onClick={() => props.setManual(false)}>
              Buscar en la lista
            </button>
            <FieldGrid>
              <Field label="Nombre comercial" htmlFor="cliente">
                <Input id="cliente" value={visit.cliente} onChange={(event) => setVisit((current) => assignVisitNumber({ ...current, cliente: event.target.value, manual: true, clienteId: "" }, props.briefs, props.editing))} />
              </Field>
              <Field label="Razón social" htmlFor="razon">
                <Input id="razon" value={visit.razonSocial} onChange={(event) => setVisit((current) => ({ ...current, razonSocial: event.target.value }))} />
              </Field>
            </FieldGrid>
            <FieldGrid>
              <Field label="Punto / sede" htmlFor="sede">
                <Input id="sede" value={visit.sede} onChange={(event) => setVisit((current) => assignVisitNumber({ ...current, sede: event.target.value }, props.briefs, props.editing))} />
              </Field>
              <Field label="Ciudad" htmlFor="ciudad">
                <Input id="ciudad" value={visit.ciudad} onChange={(event) => setVisit((current) => ({ ...current, ciudad: event.target.value }))} />
              </Field>
            </FieldGrid>
          </div>
        ) : visit.cliente ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{visit.cliente}</p>
                <p className="text-sm text-ink-2">{visit.razonSocial}</p>
                <p className="text-xs text-ink-3">{[visit.sede, visit.ciudad, visit.localidad, visit.zona].filter(Boolean).join(" · ")}</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-sm font-medium text-navy underline"
                onClick={() => setVisit((current) => ({ ...current, manual: false, clienteId: "", cliente: "", razonSocial: "", sede: "", direccion: "", ciudad: "", localidad: "", zona: "", planCli: {}, numVisita: "" }))}
              >
                Cambiar
              </button>
            </div>
            {props.siblings.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {props.siblings.map((point) => (
                  <Chip key={point.id} onClick={() => props.choosePoint(point)}>
                    {point.pointName}
                  </Chip>
                ))}
              </div>
            )}
            {(visit.planCli.fVis || visit.planCli.com) && (
              <div className="flex flex-wrap gap-2 text-xs text-ink-2">
                {visit.planCli.fVis && !pendingText(visit.planCli.fVis) && <span className="rounded-full bg-surface-2 px-2 py-1">Visita {visit.planCli.fVis.toLowerCase()}</span>}
                {visit.planCli.fCap && !pendingText(visit.planCli.fCap) && visit.planCli.fCap !== "NO APLICA" && <span className="rounded-full bg-surface-2 px-2 py-1">Capacitación {visit.planCli.fCap.toLowerCase()}</span>}
                {visit.planCli.com && <span className="rounded-full bg-surface-2 px-2 py-1">Comercial {visit.planCli.com}</span>}
                {props.lastVisit ? <span className="rounded-full bg-surface-2 px-2 py-1">Última visita {shortDate(props.lastVisit)}</span> : <span className="rounded-full bg-surface-2 px-2 py-1">Sin visitas registradas</span>}
                {props.lastVisit && props.frequencyDays ? <span className="rounded-full bg-amarillo px-2 py-1">Próxima según plan {shortDate(addDays(props.lastVisit, props.frequencyDays))}</span> : null}
              </div>
            )}
          </div>
        ) : (
          <Field label="Buscar por nombre comercial, razón social o dirección" htmlFor="cq">
            <Input id="cq" value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Ej. Artesa, Mercari, BH La Quinta…" autoComplete="off" />
          </Field>
        )}
        {!visit.cliente && props.query.trim() && props.matches.length === 0 && (
          <button type="button" className="text-sm font-medium text-navy underline" onClick={() => { props.setManual(true); setVisit((current) => ({ ...current, manual: true, clienteId: "", cliente: props.query.trim(), planCli: {} })); }}>
            No aparece. Registrar cliente nuevo
          </button>
        )}
        {!visit.cliente && (
          <div className="space-y-1">
            {props.matches.map((point) => (
              <button key={point.id} type="button" onClick={() => props.choosePoint(point)} className="block w-full rounded-md px-2 py-2 text-left hover:bg-accent-soft">
                <span className="font-medium text-ink">{point.tradeName}</span> <span className="text-xs text-ink-3">{point.pointName}</span>
                <span className="block text-xs text-ink-3">{[point.legalName, point.address, point.city].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Dirección del punto" htmlFor="direccion">
          <Input id="direccion" value={visit.direccion} onChange={(event) => setVisit((current) => ({ ...current, direccion: event.target.value }))} />
        </Field>
        <Field label="Contacto del cliente" htmlFor="contacto">
          <Input id="contacto" value={visit.contacto} placeholder="Nombre y cargo" onChange={(event) => setVisit((current) => ({ ...current, contacto: event.target.value }))} />
        </Field>
      </FieldSection>
      <FieldSection title="Fecha y horario">
        <FieldGrid>
          <Field label="Fecha" htmlFor="fecha">
            <Input id="fecha" type="date" value={visit.fecha} onChange={(event) => setVisit((current) => ({ ...current, fecha: event.target.value }))} />
          </Field>
          <Field label="Visita No." htmlFor="num">
            <Input id="num" inputMode="numeric" value={visit.numVisita} onChange={(event) => setVisit((current) => ({ ...current, numVisita: event.target.value }))} />
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Hora de entrada" htmlFor="horaIn">
            <div className="flex gap-2">
              <Input id="horaIn" type="time" value={visit.horaIn} onChange={(event) => setVisit((current) => ({ ...current, horaIn: event.target.value }))} />
              <Button type="button" variant="secondary" onClick={() => setVisit((current) => ({ ...current, horaIn: timeStamp() }))}>Ahora</Button>
            </div>
          </Field>
          <Field label="Hora de salida" htmlFor="horaOut">
            <div className="flex gap-2">
              <Input id="horaOut" type="time" value={visit.horaOut} onChange={(event) => setVisit((current) => ({ ...current, horaOut: event.target.value }))} />
              <Button type="button" variant="secondary" onClick={() => setVisit((current) => ({ ...current, horaOut: timeStamp() }))}>Ahora</Button>
            </div>
          </Field>
        </FieldGrid>
      </FieldSection>
      <FieldSection title="Personal presente">
        <Tags value={visit.personal} placeholder="Nombre de la persona" onChange={(personal) => setVisit((current) => ({ ...current, personal }))} />
      </FieldSection>
      <FieldSection title="Tipo de visita" description="Define las secciones siguientes">
        <Multi options={VISIT_TYPES} value={visit.tipos} onChange={(tipos) => setVisit((current) => ({ ...current, tipos }))} />
        {visit.tipos.includes("Otro") && (
          <Field label="¿Cuál?" htmlFor="tipoOtro">
            <Input id="tipoOtro" value={visit.tipoOtro} onChange={(event) => setVisit((current) => ({ ...current, tipoOtro: event.target.value }))} />
          </Field>
        )}
      </FieldSection>
      <FieldSection title="Objetivo de la visita">
        <Multi options={OBJECTIVES} value={visit.objetivos} onChange={(objetivos) => setVisit((current) => ({ ...current, objetivos }))} />
        <Field label="Detalle del objetivo" htmlFor="objetivoNota" hint="Opcional">
          <Textarea id="objetivoNota" value={visit.objetivoNota} onChange={(event) => setVisit((current) => ({ ...current, objetivoNota: event.target.value }))} />
        </Field>
      </FieldSection>
      <button type="button" className="text-sm font-medium text-navy underline" onClick={() => props.setShowAll(!props.showAll)}>
        {props.showAll ? "Mostrar solo las secciones de esta visita" : "Mostrar todas las secciones"}
      </button>
    </div>
  );
}

function Tecnico({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Servicio técnico</h2>
        <p className="mt-1 text-sm text-ink-2">Detalle de la intervención{visit.tecnico ? ` realizada por ${visit.tecnico}` : ""}.</p>
      </header>
      <FieldSection title="Motivo">
        <Multi options={TECH_REASONS} value={visit.tec.motivo} onChange={(motivo) => setVisit((current) => ({ ...current, tec: { ...current.tec, motivo } }))} />
      </FieldSection>
      <FieldSection title="Equipo intervenido">
        <Multi options={TECH_EQUIPMENT} value={visit.tec.equipos} onChange={(equipos) => setVisit((current) => ({ ...current, tec: { ...current.tec, equipos } }))} />
        <FieldGrid>
          <Field label="Marca / modelo" htmlFor="marca">
            <Input id="marca" value={visit.tec.marca} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, marca: event.target.value } }))} />
          </Field>
          <Field label="Serial o placa" htmlFor="serial" hint="Opcional">
            <Input id="serial" value={visit.tec.serial} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, serial: event.target.value } }))} />
          </Field>
        </FieldGrid>
      </FieldSection>
      <Field label="Falla reportada por el cliente" htmlFor="falla">
        <Textarea id="falla" value={visit.tec.falla} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, falla: event.target.value } }))} />
      </Field>
      <Field label="Diagnóstico" htmlFor="diag">
        <Textarea id="diag" value={visit.tec.diag} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, diag: event.target.value } }))} />
      </Field>
      <Field label="Trabajo realizado" htmlFor="trabajo">
        <Textarea id="trabajo" value={visit.tec.trabajo} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, trabajo: event.target.value } }))} />
      </Field>
      <FieldSection title="Repuestos utilizados">
        {visit.tec.repuestos.map((part, index) => (
          <FieldGrid key={index}>
            <Field label="Repuesto" htmlFor={`rep-${index}`}>
              <Input id={`rep-${index}`} value={part.n} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, repuestos: current.tec.repuestos.map((item, itemIndex) => itemIndex === index ? { ...item, n: event.target.value } : item) } }))} />
            </Field>
            <Field label="Cantidad" htmlFor={`repc-${index}`}>
              <div className="flex gap-2">
                <Input id={`repc-${index}`} inputMode="numeric" value={part.c} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, repuestos: current.tec.repuestos.map((item, itemIndex) => itemIndex === index ? { ...item, c: event.target.value } : item) } }))} />
                <Button type="button" variant="ghost" onClick={() => setVisit((current) => ({ ...current, tec: { ...current.tec, repuestos: current.tec.repuestos.filter((_, itemIndex) => itemIndex !== index) } }))}>Quitar</Button>
              </div>
            </Field>
          </FieldGrid>
        ))}
        <Button type="button" variant="secondary" onClick={() => setVisit((current) => ({ ...current, tec: { ...current.tec, repuestos: [...current.tec.repuestos, { n: "", c: "" }] } }))}>Agregar repuesto</Button>
      </FieldSection>
      <FieldSection title="Estado final del equipo">
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(TECH_STATUS).map(([key, label]) => (
            <Button key={key} type="button" variant={visit.tec.estado === key ? "primary" : "secondary"} onClick={() => setVisit((current) => ({ ...current, tec: { ...current.tec, estado: current.tec.estado === key ? "" : key } }))}>
              {label}
            </Button>
          ))}
        </div>
        <Field label="Próximo mantenimiento sugerido" htmlFor="proxMant">
          <Input id="proxMant" type="date" value={visit.tec.proxMant} onChange={(event) => setVisit((current) => ({ ...current, tec: { ...current.tec, proxMant: event.target.value } }))} />
        </Field>
      </FieldSection>
    </div>
  );
}

function Calibracion({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  const ratio = brewRatio(visit);
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Calibración de espresso</h2>
        <p className="mt-1 text-sm text-ink-2">El cumplimiento se marca al comparar objetivo y resultado. Puedes corregirlo a mano.</p>
      </header>
      <FieldSection title="Café en uso">
        <Choice options={PROFILES} value={visit.perfil} onChange={(perfil) => setVisit((current) => ({ ...current, perfil }))} />
      </FieldSection>
      <FieldSection title="Parámetros">
        <div className="space-y-3">
          {CAL.map((spec) => {
            const reading = visit.cal[spec.id] || {};
            const ok = calOk(visit, spec.id);
            return (
              <div key={spec.id} className="rounded-lg border border-line-2 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{spec.name} <span className="font-normal text-ink-3">{spec.unit}</span></p>
                  <button
                    type="button"
                    aria-label={`Cumple ${spec.name}`}
                    className={`grid size-9 place-items-center rounded-md border text-sm font-semibold ${ok === true ? "border-ok bg-ok-soft text-ok" : ok === false ? "border-danger bg-danger-soft text-danger" : "border-line text-ink-3"}`}
                    onClick={() => setVisit((current) => {
                      const row = { ...(current.cal[spec.id] || {}) };
                      const mark = calOk(current, spec.id);
                      if (mark === true) row.ok = false;
                      else if (mark === false) delete row.ok;
                      else row.ok = true;
                      return { ...current, cal: { ...current.cal, [spec.id]: row } };
                    })}
                  >
                    {ok === true ? "✓" : ok === false ? "✕" : "–"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["obj", "antes", "desp"] as const).map((key) => (
                    <Field key={key} label={key === "obj" ? "Objetivo" : key === "antes" ? "Antes" : "Después"} htmlFor={`${spec.id}-${key}`}>
                      <Input
                        id={`${spec.id}-${key}`}
                        inputMode={spec.text ? "text" : "decimal"}
                        value={reading[key] || ""}
                        onChange={(event) => setVisit((current) => {
                          const row = { ...(current.cal[spec.id] || {}), [key]: event.target.value };
                          delete row.ok;
                          return { ...current, cal: { ...current.cal, [spec.id]: row } };
                        })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="rounded-md bg-amarillo px-3 py-2 text-sm text-ink">
          Receta final <b>{ratio.dose ?? "—"} g → {ratio.yield ?? "—"} g</b> · ratio <b>{ratio.ratio}</b> · tiempo <b>{ratio.time ?? "—"} s</b>
        </p>
      </FieldSection>
      <FieldSection title="Evaluación sensorial" description="1 a 5">
        {SENSORY.map(([key, label]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-ink">{label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((score) => (
                <button key={score} type="button" aria-label={`${label} ${score}`} className={`grid size-10 place-items-center rounded-md border text-sm ${visit.sens[key] === score ? "border-navy bg-navy text-crema" : "border-line bg-surface"}`} onClick={() => setVisit((current) => ({ ...current, sens: { ...current.sens, [key]: current.sens[key] === score ? 0 : score } }))}>
                  {score}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Field label="Notas de cata" htmlFor="notasCata">
          <Textarea id="notasCata" value={visit.notasCata} placeholder="Ej. dulzor a caramelo, acidez brillante, final limpio" onChange={(event) => setVisit((current) => ({ ...current, notasCata: event.target.value }))} />
        </Field>
      </FieldSection>
      <FieldSection title="Agua" description="Opcional">
        <FieldGrid>
          <Field label="TDS del agua" htmlFor="aguaTds" hint="ppm">
            <Input id="aguaTds" inputMode="decimal" value={visit.agua.tds} onChange={(event) => setVisit((current) => ({ ...current, agua: { ...current.agua, tds: event.target.value } }))} />
          </Field>
          <Field label="Dureza" htmlFor="dureza" hint="ppm o gpg">
            <Input id="dureza" value={visit.agua.dureza} onChange={(event) => setVisit((current) => ({ ...current, agua: { ...current.agua, dureza: event.target.value } }))} />
          </Field>
        </FieldGrid>
        <Field label="Último cambio de filtro" htmlFor="filtro">
          <Input id="filtro" type="date" value={visit.agua.filtroFecha} onChange={(event) => setVisit((current) => ({ ...current, agua: { ...current.agua, filtroFecha: event.target.value } }))} />
        </Field>
      </FieldSection>
      <FieldSection title="Leche" description="Opcional">
        <Multi options={MILKS} value={visit.lecheInfo.tipos} onChange={(tipos) => setVisit((current) => ({ ...current, lecheInfo: { ...current.lecheInfo, tipos } }))} />
        <Field label="Temperatura de vaporizado" htmlFor="lecheTemp" hint="°C">
          <Input id="lecheTemp" inputMode="decimal" value={visit.lecheInfo.temp} onChange={(event) => setVisit((current) => ({ ...current, lecheInfo: { ...current.lecheInfo, temp: event.target.value } }))} />
        </Field>
      </FieldSection>
    </div>
  );
}

function Equipo({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink">Revisión del equipo</h2>
          <p className="mt-1 text-sm text-ink-2">Solo los puntos que marques aparecen en el reporte.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setVisit((current) => {
          const equipo = { ...current.equipo };
          for (const [id] of EQUIPMENT) if (!equipo[id]?.st) equipo[id] = { ...(equipo[id] || {}), st: "ok" };
          return { ...current, equipo };
        })}>Marcar todo OK</Button>
      </header>
      {EQUIPMENT_GROUPS.map((group) => (
        <FieldSection key={group.group} title={group.group}>
          {group.items.map(([id, name]) => {
            const reading = visit.equipo[id] || {};
            return (
              <div key={id} className="space-y-2 border-b border-line-2 py-2 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-ink">{name}</span>
                  <div className="flex gap-1">
                    {[["ok", "OK"], ["att", "Atención"], ["na", "N/A"]].map(([state, label]) => (
                      <Chip key={state} active={reading.st === state} alert={state === "att" && reading.st === state} onClick={() => setVisit((current) => ({ ...current, equipo: { ...current.equipo, [id]: { ...(current.equipo[id] || {}), st: current.equipo[id]?.st === state ? "" : state } } }))}>{label}</Chip>
                    ))}
                  </div>
                </div>
                {reading.st === "att" && (
                  <Input placeholder="¿Qué se encontró o se hizo?" aria-label={`Observación ${name}`} value={reading.obs || ""} onChange={(event) => setVisit((current) => ({ ...current, equipo: { ...current.equipo, [id]: { ...(current.equipo[id] || {}), obs: event.target.value } } }))} />
                )}
              </div>
            );
          })}
        </FieldSection>
      ))}
      <Field label="Recomendaciones técnicas" htmlFor="recoTec">
        <Textarea id="recoTec" value={visit.recoTec} onChange={(event) => setVisit((current) => ({ ...current, recoTec: event.target.value }))} />
      </Field>
    </div>
  );
}

function Capacitacion({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Capacitación</h2>
        <p className="mt-1 text-sm text-ink-2">Nivel observado del equipo del cliente en cada habilidad trabajada.</p>
      </header>
      <FieldSection title="Personas capacitadas">
        <Tags value={visit.capacitados} placeholder="Nombre del barista" onChange={(capacitados) => setVisit((current) => ({ ...current, capacitados }))} />
      </FieldSection>
      <FieldSection title="Habilidades">
        {SKILLS.map(([id, name]) => (
          <div key={id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 py-2">
            <span className="text-sm text-ink">{name}</span>
            <div className="flex flex-wrap gap-1">
              {SKILL_SHORT.map((label, index) => (
                <Chip key={label} active={visit.skills[id] === index + 1} title={LEVEL_NAMES[index]} onClick={() => setVisit((current) => ({ ...current, skills: { ...current.skills, [id]: current.skills[id] === index + 1 ? 0 : index + 1 } }))}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </FieldSection>
    </div>
  );
}

function Comercial({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Seguimiento comercial</h2>
        <p className="mt-1 text-sm text-ink-2">Estado de la cuenta. Las oportunidades quedan solo para el equipo.</p>
      </header>
      <FieldSection title="Perfiles en uso">
        <Multi options={PROFILES} value={visit.com.perfiles} onChange={(perfiles) => setVisit((current) => ({ ...current, com: { ...current.com, perfiles } }))} />
      </FieldSection>
      <FieldGrid>
        <Field label="Consumo mensual actual" htmlFor="consumo">
          <Input id="consumo" value={visit.com.consumo} placeholder="Ej. 12 bolsas de 2,5 kg" onChange={(event) => setVisit((current) => ({ ...current, com: { ...current.com, consumo: event.target.value } }))} />
        </Field>
        <Field label="Inventario disponible" htmlFor="inventario">
          <Input id="inventario" value={visit.com.inventario} placeholder="Ej. 3 bolsas" onChange={(event) => setVisit((current) => ({ ...current, com: { ...current.com, inventario: event.target.value } }))} />
        </Field>
      </FieldGrid>
      <Field label="Estado de la estación / material de marca" htmlFor="estacion">
        <Input id="estacion" value={visit.com.estacion} onChange={(event) => setVisit((current) => ({ ...current, com: { ...current.com, estacion: event.target.value } }))} />
      </Field>
      <Field label="Pedidos o solicitudes del cliente" htmlFor="solicitudes">
        <Textarea id="solicitudes" value={visit.com.solicitudes} onChange={(event) => setVisit((current) => ({ ...current, com: { ...current.com, solicitudes: event.target.value } }))} />
      </Field>
      <Field label="Oportunidades identificadas" htmlFor="oportunidades" hint="Solo equipo">
        <Textarea id="oportunidades" value={visit.oportunidades} onChange={(event) => setVisit((current) => ({ ...current, oportunidades: event.target.value }))} />
      </Field>
    </div>
  );
}

function Resultado({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Antes y después</h2>
        <p className="mt-1 text-sm text-ink-2">Cómo encontraste la operación y cómo la dejaste. Hasta 4 fotos.</p>
      </header>
      <Field label="Condición encontrada al llegar" htmlFor="antes">
        <Textarea id="antes" value={visit.antes} onChange={(event) => setVisit((current) => ({ ...current, antes: event.target.value }))} />
      </Field>
      <Field label="Ajustes y capacitación realizados" htmlFor="ajustes">
        <Textarea id="ajustes" value={visit.ajustes} onChange={(event) => setVisit((current) => ({ ...current, ajustes: event.target.value }))} />
      </Field>
      <Field label="Resultado obtenido" htmlFor="resultado">
        <Textarea id="resultado" value={visit.resultado} onChange={(event) => setVisit((current) => ({ ...current, resultado: event.target.value }))} />
      </Field>
      <FieldSection title="Fotos">
        {visit.fotos.length < 4 && (
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (event) => {
                const files = [...(event.target.files || [])].slice(0, 4 - visit.fotos.length);
                const photos = [...visit.fotos];
                for (const file of files) {
                  try {
                    const src = await compressImage(file);
                    photos.push({ src, tag: photos.some((photo) => photo.tag === "Antes") ? "Después" : "Antes" });
                  } catch {
                    /* Skip a file the phone cannot decode. */
                  }
                }
                setVisit((current) => ({ ...current, fotos: photos }));
                event.target.value = "";
              }}
            />
            <span className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-3 text-sm font-medium">Tomar o subir foto</span>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          {visit.fotos.map((photo, index) => (
            <div key={index} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt={`Foto ${index + 1}`} className="aspect-[4/3] w-full rounded-md object-cover" />
              <div className="flex gap-1">
                {["Antes", "Después"].map((tag) => (
                  <Chip key={tag} active={photo.tag === tag} onClick={() => setVisit((current) => ({ ...current, fotos: current.fotos.map((item, itemIndex) => itemIndex === index ? { ...item, tag } : item) }))}>{tag}</Chip>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setVisit((current) => ({ ...current, fotos: current.fotos.filter((_, itemIndex) => itemIndex !== index) }))}>Quitar</Button>
              </div>
            </div>
          ))}
        </div>
      </FieldSection>
    </div>
  );
}

function Cierre({ visit, setVisit }: { visit: VisitRecord; setVisit: (update: (visit: VisitRecord) => VisitRecord) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-2xl text-ink">Cierre y firmas</h2>
        <p className="mt-1 text-sm text-ink-2">Lo que el cliente verá como conclusión de la visita.</p>
      </header>
      <FieldSection title="Resultado de la visita">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(RESULT).map(([key, item]) => (
            <button key={key} type="button" onClick={() => setVisit((current) => ({ ...current, resultadoFinal: current.resultadoFinal === key ? "" : key }))} className={`rounded-lg border px-3 py-3 text-left ${visit.resultadoFinal === key ? "border-navy bg-accent-soft" : "border-line bg-surface"}`}>
              <span className="block font-medium text-ink">{item.name}</span>
              <span className="block text-xs text-ink-3">{item.detail}</span>
            </button>
          ))}
        </div>
        <Field label="Resumen de la visita" htmlFor="resumen" hint="Aparece al inicio del reporte">
          <Textarea id="resumen" value={visit.resumen} onChange={(event) => setVisit((current) => ({ ...current, resumen: event.target.value }))} />
        </Field>
      </FieldSection>
      <FieldSection title="Satisfacción del cliente">
        <div className="flex gap-1" aria-label="Satisfacción">
          {[1, 2, 3, 4, 5].map((score) => (
            <button key={score} type="button" aria-label={`${score} estrellas`} className={`text-2xl ${visit.satisf >= score ? "text-navy" : "text-ink-3"}`} onClick={() => setVisit((current) => ({ ...current, satisf: current.satisf === score ? 0 : score }))}>★</button>
          ))}
        </div>
        <Field label="¿Qué fue lo más positivo para el cliente?" htmlFor="positivo">
          <Textarea id="positivo" value={visit.positivo} onChange={(event) => setVisit((current) => ({ ...current, positivo: event.target.value }))} />
        </Field>
        <Field label="Comentarios o solicitudes del cliente" htmlFor="comentarios">
          <Textarea id="comentarios" value={visit.comentarios} onChange={(event) => setVisit((current) => ({ ...current, comentarios: event.target.value }))} />
        </Field>
      </FieldSection>
      <FieldSection title="Plan de acción">
        <Multi options={PLAN_OPTIONS} value={visit.plan} exclusiveNone onChange={(plan) => setVisit((current) => ({ ...current, plan }))} />
        {visit.acciones.map((action, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-line-2 p-3">
            <Field label="Acción" htmlFor={`accion-${index}`}>
              <Input id={`accion-${index}`} value={action.a} onChange={(event) => setVisit((current) => ({ ...current, acciones: current.acciones.map((item, itemIndex) => itemIndex === index ? { ...item, a: event.target.value } : item) }))} />
            </Field>
            <FieldGrid>
              <Field label="Responsable" htmlFor={`resp-${index}`}>
                <Input id={`resp-${index}`} value={action.r} onChange={(event) => setVisit((current) => ({ ...current, acciones: current.acciones.map((item, itemIndex) => itemIndex === index ? { ...item, r: event.target.value } : item) }))} />
              </Field>
              <Field label="Fecha límite" htmlFor={`fecha-${index}`}>
                <Input id={`fecha-${index}`} type="date" value={action.f} onChange={(event) => setVisit((current) => ({ ...current, acciones: current.acciones.map((item, itemIndex) => itemIndex === index ? { ...item, f: event.target.value } : item) }))} />
              </Field>
            </FieldGrid>
            <Button type="button" variant="ghost" size="sm" onClick={() => setVisit((current) => ({ ...current, acciones: current.acciones.filter((_, itemIndex) => itemIndex !== index) }))}>Quitar</Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setVisit((current) => ({ ...current, acciones: [...current.acciones, { a: "", r: "", f: "" }] }))}>Agregar acción</Button>
        <Field label="Próxima visita sugerida" htmlFor="prox">
          <Input id="prox" type="date" value={visit.proxVisita} onChange={(event) => setVisit((current) => ({ ...current, proxVisita: event.target.value }))} />
        </Field>
      </FieldSection>
      <Field label="Nota interna" htmlFor="nota" hint="Solo para el equipo Libertario">
        <Textarea id="nota" value={visit.notaInterna} onChange={(event) => setVisit((current) => ({ ...current, notaInterna: event.target.value }))} />
      </Field>
      <FieldGrid>
        <Field label="Nombre de quien recibe" htmlFor="firmaNombre">
          <Input id="firmaNombre" value={visit.firmaClienteNombre} onChange={(event) => setVisit((current) => ({ ...current, firmaClienteNombre: event.target.value }))} />
        </Field>
        <Field label="Cargo" htmlFor="firmaCargo">
          <Input id="firmaCargo" value={visit.firmaClienteCargo} onChange={(event) => setVisit((current) => ({ ...current, firmaClienteCargo: event.target.value }))} />
        </Field>
      </FieldGrid>
      <SignaturePad label="Firma de quien visitó" value={visit.firmaBarista} onChange={(firmaBarista) => setVisit((current) => ({ ...current, firmaBarista }))} />
      <SignaturePad label="Firma de quien recibe" value={visit.firmaCliente} onChange={(firmaCliente) => setVisit((current) => ({ ...current, firmaCliente }))} />
    </div>
  );
}
