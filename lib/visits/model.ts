import {
  cleanPointText,
  fold,
  hasText,
  matchTeam,
  type TeamMember,
} from "@/lib/visits/catalog";
import type { SeedPoint } from "@/lib/visits/points-seed";

export type CalReading = { obj?: string; antes?: string; desp?: string; ok?: boolean | null };
export type EquipmentReading = { st?: string; obs?: string };
export type TechPart = { n: string; c: string };
export type ActionItem = { a: string; r: string; f: string };
export type VisitPhoto = { tag: string; src: string; photoId?: number };

export type VisitPlan = { fVis?: string; fCap?: string; com?: string; bar?: string };

export type VisitRecord = {
  id: string;
  status: "borrador" | "final";
  createdAt: number;
  updatedAt: number;
  visitante: string;
  responsable: string;
  respId: string;
  respCargo: string;
  respEmail: string;
  respTel: string;
  cliente: string;
  sede: string;
  contacto: string;
  fecha: string;
  horaIn: string;
  horaOut: string;
  numVisita: string;
  personal: string[];
  tipos: string[];
  tipoOtro: string;
  objetivos: string[];
  objetivoNota: string;
  perfil: string;
  cal: Record<string, CalReading>;
  sens: Record<string, number>;
  notasCata: string;
  equipo: Record<string, EquipmentReading>;
  recoTec: string;
  skills: Record<string, number>;
  capacitados: string[];
  antes: string;
  ajustes: string;
  resultado: string;
  fotos: VisitPhoto[];
  com: { perfiles: string[]; consumo: string; inventario: string; estacion: string; solicitudes: string };
  oportunidades: string;
  satisf: number;
  positivo: string;
  comentarios: string;
  plan: string[];
  acciones: ActionItem[];
  proxVisita: string;
  resultadoFinal: string;
  resumen: string;
  notaInterna: string;
  firmaBarista: string;
  firmaCliente: string;
  firmaClienteNombre: string;
  firmaClienteCargo: string;
  mailSigner: string;
  tecnico: string;
  tecnicoEmpresa: string;
  tec: {
    equipos: string[];
    marca: string;
    serial: string;
    motivo: string[];
    falla: string;
    diag: string;
    trabajo: string;
    repuestos: TechPart[];
    estado: string;
    proxMant: string;
  };
  agua: { tds: string; dureza: string; filtroFecha: string };
  lecheInfo: { tipos: string[]; temp: string };
  clienteId: string;
  manual: boolean;
  razonSocial: string;
  direccion: string;
  ciudad: string;
  localidad: string;
  zona: string;
  planCli: VisitPlan;
  origen?: string;
  importedAt?: number;
};

export type VisitPoint = SeedPoint & { leadImportKey: string | null };

export type VisitBrief = { id: string; cliente: string; sede: string; fecha?: string; status?: string };

export type VisitStep = { id: "datos" | "tec" | "cal" | "equipo" | "capac" | "com" | "result" | "cierre"; name: string };

export function visitId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts;
}

export function timeStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return parts;
}

export function blankVisit(prefill?: Partial<VisitRecord>): VisitRecord {
  const visit: VisitRecord = {
    id: visitId(),
    status: "borrador",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    visitante: "Barista",
    responsable: "",
    respId: "",
    respCargo: "",
    respEmail: "",
    respTel: "",
    cliente: "",
    sede: "",
    contacto: "",
    fecha: todayStamp(),
    horaIn: timeStamp(),
    horaOut: "",
    numVisita: "",
    personal: [],
    tipos: [],
    tipoOtro: "",
    objetivos: [],
    objetivoNota: "",
    perfil: "",
    cal: {},
    sens: {},
    notasCata: "",
    equipo: {},
    recoTec: "",
    skills: {},
    capacitados: [],
    antes: "",
    ajustes: "",
    resultado: "",
    fotos: [],
    com: { perfiles: [], consumo: "", inventario: "", estacion: "", solicitudes: "" },
    oportunidades: "",
    satisf: 0,
    positivo: "",
    comentarios: "",
    plan: [],
    acciones: [],
    proxVisita: "",
    resultadoFinal: "",
    resumen: "",
    notaInterna: "",
    firmaBarista: "",
    firmaCliente: "",
    firmaClienteNombre: "",
    firmaClienteCargo: "",
    mailSigner: "",
    tecnico: "",
    tecnicoEmpresa: "Servicio técnico Libertario",
    tec: { equipos: [], marca: "", serial: "", motivo: [], falla: "", diag: "", trabajo: "", repuestos: [], estado: "", proxMant: "" },
    agua: { tds: "", dureza: "", filtroFecha: "" },
    lecheInfo: { tipos: [], temp: "" },
    clienteId: "",
    manual: false,
    razonSocial: "",
    direccion: "",
    ciudad: "",
    localidad: "",
    zona: "",
    planCli: {},
  };
  return prefill ? normalizeVisit({ ...visit, ...prefill, id: prefill.id || visit.id }) : visit;
}

const NESTED = ["com", "tec", "agua", "lecheInfo", "planCli"] as const;

/** Fills keys the phone app may omit so older LIBV1 records still open. */
export function normalizeVisit(input: Partial<VisitRecord>): VisitRecord {
  const base = blankVisit();
  const merged = { ...base, ...input, id: input.id || base.id } as VisitRecord;
  for (const key of NESTED) {
    const extra = input[key];
    merged[key] = { ...base[key], ...(extra && typeof extra === "object" && !Array.isArray(extra) ? extra : {}) } as never;
  }
  merged.cal = input.cal && typeof input.cal === "object" ? input.cal : {};
  merged.sens = input.sens && typeof input.sens === "object" ? input.sens : {};
  merged.equipo = input.equipo && typeof input.equipo === "object" ? input.equipo : {};
  merged.skills = input.skills && typeof input.skills === "object" ? input.skills : {};
  merged.personal = Array.isArray(input.personal) ? input.personal : [];
  merged.tipos = Array.isArray(input.tipos) ? input.tipos : [];
  merged.objetivos = Array.isArray(input.objetivos) ? input.objetivos : [];
  merged.capacitados = Array.isArray(input.capacitados) ? input.capacitados : [];
  merged.fotos = Array.isArray(input.fotos) ? input.fotos : [];
  merged.plan = Array.isArray(input.plan) ? input.plan : [];
  merged.acciones = Array.isArray(input.acciones) ? input.acciones : [];
  merged.com.perfiles = Array.isArray(merged.com.perfiles) ? merged.com.perfiles : [];
  merged.tec.equipos = Array.isArray(merged.tec.equipos) ? merged.tec.equipos : [];
  merged.tec.motivo = Array.isArray(merged.tec.motivo) ? merged.tec.motivo : [];
  merged.tec.repuestos = Array.isArray(merged.tec.repuestos) ? merged.tec.repuestos : [];
  merged.lecheInfo.tipos = Array.isArray(merged.lecheInfo.tipos) ? merged.lecheInfo.tipos : [];
  merged.satisf = Number(merged.satisf) || 0;
  merged.status = input.status === "final" ? "final" : "borrador";
  if (!merged.createdAt) merged.createdAt = Date.now();
  merged.updatedAt = input.updatedAt || Date.now();
  return merged;
}

export function stepsFor(visit: VisitRecord, showAll = false): VisitStep[] {
  const types = new Set(visit.tipos);
  const objectives = new Set(visit.objetivos);
  const steps: VisitStep[] = [{ id: "datos", name: "Datos" }];
  const fresh = types.has("Nueva cuenta / instalación");
  const technical = showAll || visit.visitante === "Técnico" || types.has("Servicio técnico") || types.has("Mantenimiento preventivo") || objectives.has("Solucionar falla de equipo");
  const calibration = showAll || types.has("Calibración de café") || types.has("Calibración de equipo") || fresh || objectives.has("Mejorar espresso") || objectives.has("Ajustar molino") || objectives.has("Calibrar máquina");
  const equipment = showAll || technical || types.has("Calibración de equipo") || fresh || objectives.has("Limpieza / mantenimiento") || objectives.has("Calibrar máquina");
  const training = showAll || types.has("Capacitación de baristas") || fresh || objectives.has("Capacitación") || objectives.has("Leche / latte art") || objectives.has("Recetas y estándares");
  const commercial = showAll || visit.visitante === "Comercial" || types.has("Visita comercial") || objectives.has("Revisión de consumo") || objectives.has("Presentación de portafolio");
  if (technical) steps.push({ id: "tec", name: "Servicio técnico" });
  if (calibration) steps.push({ id: "cal", name: "Calibración" });
  if (equipment) steps.push({ id: "equipo", name: "Equipo" });
  if (training) steps.push({ id: "capac", name: "Capacitación" });
  if (commercial) steps.push({ id: "com", name: "Comercial" });
  steps.push({ id: "result", name: "Antes y después" });
  steps.push({ id: "cierre", name: "Cierre y firmas" });
  return steps;
}

export function assignMember(visit: VisitRecord, member: TeamMember): VisitRecord {
  return { ...visit, responsable: member.name, respId: member.id, respCargo: member.title, respEmail: member.email, respTel: member.phone };
}

export function clearMember(visit: VisitRecord): VisitRecord {
  return { ...visit, responsable: "", respId: "", respCargo: "", respEmail: "", respTel: "" };
}

export function assignVisitNumber(visit: VisitRecord, briefs: VisitBrief[], editing: boolean): VisitRecord {
  if (editing) return visit;
  const client = fold(visit.cliente).trim();
  if (!client) return visit;
  const count = briefs.filter((brief) => brief.id !== visit.id && fold(brief.cliente).trim() === client && fold(brief.sede) === fold(visit.sede)).length;
  if (count > 0 || !visit.numVisita) return { ...visit, numVisita: String(count + 1) };
  return visit;
}

export function applyPoint(visit: VisitRecord, point: VisitPoint, briefs: VisitBrief[], editing: boolean): VisitRecord {
  let next: VisitRecord = {
    ...visit,
    clienteId: point.id,
    manual: false,
    cliente: point.tradeName,
    razonSocial: point.legalName,
    sede: point.pointName,
    direccion: cleanPointText(point.address),
    ciudad: cleanPointText(point.city),
    localidad: cleanPointText(point.locality),
    zona: cleanPointText(point.zone),
    planCli: {
      fVis: point.visitFrequency,
      fCap: point.trainingFrequency,
      com: point.commercial,
      bar: point.visitBarista || point.trainingBarista,
    },
  };
  if (!hasText(next.responsable)) {
    const source = next.visitante === "Barista" ? point.visitBarista || point.trainingBarista : point.commercial;
    const member = matchTeam(source);
    if (member && (next.visitante !== "Barista" || member.role === "Barista")) next = assignMember(next, member);
  }
  return assignVisitNumber(next, briefs, editing);
}

export function prefillFromVisit(source: VisitRecord): Partial<VisitRecord> {
  const cal: Record<string, CalReading> = {};
  for (const [key, reading] of Object.entries(source.cal || {})) {
    const objective = hasText(reading.desp) ? reading.desp : reading.obj;
    if (hasText(objective)) cal[key] = { obj: objective };
  }
  return {
    cliente: source.cliente,
    sede: source.sede,
    contacto: source.contacto,
    clienteId: source.clienteId || "",
    manual: !!source.manual && !source.clienteId,
    razonSocial: source.razonSocial || "",
    direccion: source.direccion || "",
    ciudad: source.ciudad || "",
    localidad: source.localidad || "",
    zona: source.zona || "",
    planCli: source.planCli || {},
    perfil: source.perfil,
    cal,
    com: { perfiles: [...(source.com?.perfiles || [])], consumo: "", inventario: "", estacion: "", solicitudes: "" },
  };
}
