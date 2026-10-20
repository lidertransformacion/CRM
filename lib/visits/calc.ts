import {
  CAL,
  COMMERCIALS,
  EQUIPMENT,
  FREQ_DAYS,
  MONTHS,
  OWNER_LABEL,
  RESULT,
  SKILLS,
  TEAM,
  TECH_STATUS,
  VISITOR_LABEL,
  WHATSAPP_DESTINATION,
  fold,
  hasText,
  matchTeam,
  parseNumber,
} from "@/lib/visits/catalog";
import { type VisitPoint, type VisitRecord } from "@/lib/visits/model";

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function bogotaToday(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function mondayOf(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysBetween(start: string, end: string): number {
  const utc = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(end) - utc(start)) / 86_400_000);
}

export function longDate(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

export function shortDate(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}`;
}

export function dayMonth(iso: string): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-").map(Number);
  return `${day} de ${MONTHS[month - 1]}`;
}

export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const [, monthStart, dayStart] = start.split("-").map(Number);
  const [yearEnd, monthEnd, dayEnd] = end.split("-").map(Number);
  if (monthStart !== monthEnd) return `${dayStart} de ${MONTHS[monthStart - 1]} al ${dayEnd} de ${MONTHS[monthEnd - 1]} de ${yearEnd}`;
  return `${dayStart} al ${dayEnd} de ${MONTHS[monthStart - 1]} de ${yearEnd}`;
}

export function reportNumber(visit: VisitRecord): string {
  const fecha = visit.fecha || bogotaToday();
  return `RV-${fecha.replace(/-/g, "").slice(2)}-${(visit.id || "").slice(-4).toUpperCase()}`;
}

export function calAuto(visit: VisitRecord, id: string): boolean | null {
  const reading = visit.cal[id] || {};
  const spec = CAL.find((item) => item.id === id);
  if (!spec) return null;
  if (spec.text) return hasText(reading.desp) ? true : null;
  const objective = parseNumber(reading.obj);
  const after = parseNumber(reading.desp);
  if (objective == null || after == null || spec.tolerance == null) return null;
  return Math.abs(objective - after) <= spec.tolerance + 1e-9;
}

export function calOk(visit: VisitRecord, id: string): boolean | null {
  const reading = visit.cal[id] || {};
  if (reading.ok === true || reading.ok === false) return reading.ok;
  return calAuto(visit, id);
}

export function brewRatio(visit: VisitRecord): { dose: number | null; yield: number | null; time: number | null; ratio: string } {
  const pick = (id: string) => {
    const reading = visit.cal[id] || {};
    return parseNumber(reading.desp) ?? parseNumber(reading.obj);
  };
  const dose = pick("dosis");
  const yieldGrams = pick("yield");
  const time = pick("tiempo");
  const ratio = dose && yieldGrams ? `1:${(yieldGrams / dose).toFixed(1)}` : "—";
  return { dose, yield: yieldGrams, time, ratio };
}

function niceName(value: string): string {
  const name = String(value || "").trim();
  if (!name || name !== name.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]{3}/.test(name)) return name;
  const small = ["de", "del", "la", "las", "el", "los", "y", "en"];
  return name
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.includes(lower)) return lower;
      if (word.length <= 2 || /\d/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function yList(items: string[]): string {
  if (items.length < 2) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function lowerFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function shortText(value: string, max: number): string {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,;:]$/, "")}…`;
}

const OPENING: Record<string, string> = {
  exc: "¡Fue una excelente visita!",
  bue: "Fue una buena visita y quedan solo un par de ajustes.",
  seg: "Avanzamos bastante y dejamos tareas claras para la próxima.",
  tec: "El equipo necesita atención especializada y ya estamos en ello.",
};

export function mailSigner(visit: VisitRecord) {
  const chosen = COMMERCIALS.find((member) => member.id === visit.mailSigner);
  if (chosen) return chosen;
  const assigned = matchTeam(visit.planCli?.com || "");
  if (assigned && assigned.role === "Comercial") return assigned;
  const author = TEAM.find((member) => member.id === visit.respId);
  if (author && author.role === "Comercial") return author;
  return COMMERCIALS[0];
}

export type EmailDraft = {
  subject: string;
  salutation: string;
  intro: string;
  lines: { icon: string; label: string; text: string }[];
  quote: string;
  closing: string;
  signature: string[];
};

export function emailDraft(visit: VisitRecord): EmailDraft {
  const named = { ...visit, cliente: niceName(visit.cliente) };
  const place = named.cliente + (named.sede && !/^principal$/i.test(named.sede) ? ` – ${named.sede}` : "");
  const intro = `Gracias por recibirnos el ${dayMonth(named.fecha)}${named.sede && !/^principal$/i.test(named.sede) ? ` en ${named.sede}` : ""}. ${OPENING[named.resultadoFinal] || ""} Aquí va el resumen rápido:`
    .replace(/\s+/g, " ")
    .trim();
  const lines: EmailDraft["lines"] = [];
  const tech = named.tec || ({} as VisitRecord["tec"]);
  if (hasText(tech.trabajo) || tech.estado) {
    const status = tech.estado && tech.estado in TECH_STATUS ? `equipo ${TECH_STATUS[tech.estado as keyof typeof TECH_STATUS].toLowerCase()}` : "";
    lines.push({ icon: "🔧", label: "Servicio técnico", text: [hasText(tech.trabajo) ? shortText(tech.trabajo, 80) : "", status].filter(hasText).join(" · ") });
  }
  const reading = (id: string) => {
    const row = named.cal[id] || {};
    return hasText(row.desp) ? row.desp : null;
  };
  if (reading("dosis") && reading("yield")) {
    lines.push({
      icon: "☕",
      label: `Receta ${named.perfil || "calibrada"}`,
      text: `${reading("dosis")} g → ${reading("yield")} g${reading("tiempo") ? ` en ${reading("tiempo")} s` : ""}`,
    });
  }
  const skills = SKILLS.filter(([id]) => named.skills[id] > 0).map(([, name]) => name.toLowerCase().replace("preparación de ", "").replace("vaporización de ", ""));
  if (skills.length || named.capacitados.length) {
    const who = named.capacitados.length ? (named.capacitados.length > 2 ? `${named.capacitados.length} personas` : yList(named.capacitados.map((name) => name.split(" ")[0]))) : "al equipo";
    lines.push({ icon: "🎓", label: "Capacitación", text: `${who}${skills.length ? ` en ${yList(skills.slice(0, 3))}` : ""}` });
  }
  const attention = EQUIPMENT.filter(([id]) => (named.equipo[id] || {}).st === "att").map(([, name]) => lowerFirst(name));
  const okCount = EQUIPMENT.filter(([id]) => (named.equipo[id] || {}).st === "ok").length;
  if (attention.length) lines.push({ icon: "⚠️", label: "Por atender", text: yList(attention.slice(0, 3)) + (attention.length > 3 ? ` y ${attention.length - 3} más` : "") });
  else if (okCount) lines.push({ icon: "✅", label: "Equipo", text: "todo en orden" });
  const actions = named.acciones.filter((action) => hasText(action.a));
  if (actions.length) {
    lines.push({
      icon: "➡️",
      label: "Próximo paso",
      text: `${shortText(actions[0].a, 60)}${actions[0].f ? ` (${dayMonth(actions[0].f)})` : ""}${actions.length > 1 ? ` · +${actions.length - 1} en el PDF` : ""}`,
    });
  }
  if (named.proxVisita) lines.push({ icon: "📅", label: "Próxima visita", text: dayMonth(named.proxVisita) });
  if (!lines.length && hasText(named.resumen)) lines.push({ icon: "📝", label: "En resumen", text: shortText(named.resumen, 120) });
  const quote = hasText(named.positivo) && named.positivo.trim().length <= 90 ? `Lo que más les gustó: “${named.positivo.trim().replace(/\.$/, "")}”. ¡Nos encanta saberlo!` : "";
  const signer = mailSigner(visit);
  const signature = [signer.name, `${signer.title} · Libertario Hospitality`, signer.email, signer.phone].filter(hasText);
  const subject = `☕ Así fue nuestra visita a ${place} (${shortDate(named.fecha).replace(/ \d{4}$/, "")})`;
  return {
    subject,
    salutation: `Equipo ${named.cliente},`,
    intro,
    lines,
    quote,
    closing: "Todo el detalle está en el PDF adjunto. ¿Alguna duda? Respondan este correo y lo resolvemos.",
    signature,
  };
}

export function emailText(visit: VisitRecord): string {
  const draft = emailDraft(visit);
  const lines = [draft.salutation, "", draft.intro, ""];
  for (const line of draft.lines) lines.push(`${line.icon} ${line.label}: ${line.text}`);
  lines.push("");
  if (draft.quote) lines.push(draft.quote, "");
  lines.push(draft.closing, "", "Por la libertad de vivir el café.", "", "Un abrazo,", ...draft.signature);
  return lines.join("\n");
}

export function whatsAppText(visit: VisitRecord, code: string): string {
  const result = visit.resultadoFinal && visit.resultadoFinal in RESULT ? RESULT[visit.resultadoFinal as keyof typeof RESULT] : null;
  const who =
    visit.visitante === "Técnico"
      ? `Técnico · ${visit.tecnico || "—"}${hasText(visit.tecnicoEmpresa) ? ` (${visit.tecnicoEmpresa})` : ""}${hasText(visit.responsable) ? `\n*Diligenció:* ${visit.responsable}` : ""}`
      : `${visit.visitante} · ${visit.responsable || "—"}`;
  const types = visit.tipos.map((type) => (type === "Otro" && visit.tipoOtro ? visit.tipoOtro : type)).join(", ");
  const lines = [
    "*REGISTRO DE VISITA · LIBERTARIO*",
    reportNumber(visit),
    "",
    `*Cliente:* ${visit.cliente}${visit.sede ? ` – ${visit.sede}` : ""}`,
    hasText(visit.razonSocial) ? `*Razón social:* ${visit.razonSocial}` : "",
    hasText(visit.ciudad) ? `*Ciudad:* ${visit.ciudad}` : "",
    `*Fecha:* ${shortDate(visit.fecha)}${visit.horaIn ? ` · ${visit.horaIn}${visit.horaOut ? ` – ${visit.horaOut}` : ""}` : ""}`,
    `*Visita:* ${who}`,
    types ? `*Tipo:* ${types}` : "",
    result ? `*Resultado:* ${result.name}` : "",
    hasText(visit.resumen) ? `*Resumen:* ${visit.resumen.trim()}` : "",
    visit.proxVisita ? `*Próxima visita:* ${shortDate(visit.proxVisita)}` : "",
    "",
    "_Código para el historial (no modificar):_",
    code,
  ];
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export function whatsAppLink(message: string): string {
  return `https://wa.me/${WHATSAPP_DESTINATION}?text=${encodeURIComponent(message)}`;
}

export type ReportSection = { title: string; lines: string[] };

export function reportSections(visit: VisitRecord, audience: "client" | "team" = "client"): ReportSection[] {
  const sections: ReportSection[] = [];
  const place = [visit.sede, visit.direccion, visit.ciudad].filter(hasText).join(" · ");
  sections.push({
    title: "Visita",
    lines: [
      `Reporte ${reportNumber(visit)}`,
      `Cliente: ${visit.cliente || "—"}`,
      visit.razonSocial ? `Razón social: ${visit.razonSocial}` : "",
      place ? `Punto: ${place}` : "",
      `Fecha: ${longDate(visit.fecha) || "—"}${visit.horaIn ? ` · ${visit.horaIn}${visit.horaOut ? ` – ${visit.horaOut}` : ""}` : ""}`,
      `Visita No. ${visit.numVisita || "—"}`,
      `Quién visitó: ${visit.visitante === "Técnico" ? visit.tecnico || "Técnico" : visit.responsable || visit.visitante}${visit.respCargo ? ` · ${visit.respCargo}` : ""}`,
      visit.tipos.length ? `Tipo: ${visit.tipos.map((type) => (type === "Otro" && visit.tipoOtro ? visit.tipoOtro : type)).join(", ")}` : "",
      visit.objetivos.length ? `Objetivo: ${visit.objetivos.join(", ")}` : "",
      visit.objetivoNota ? visit.objetivoNota : "",
      visit.resumen ? `Resumen: ${visit.resumen}` : "",
    ].filter(hasText),
  });
  const calibration = CAL.map((spec) => {
    const reading = visit.cal[spec.id];
    if (!reading || (!hasText(reading.obj) && !hasText(reading.antes) && !hasText(reading.desp))) return "";
    const mark = calOk(visit, spec.id);
    const flag = mark === true ? "OK" : mark === false ? "Fuera" : "—";
    return `${spec.name}: objetivo ${reading.obj || "—"} ${spec.unit} · antes ${reading.antes || "—"} · después ${reading.desp || "—"} · ${flag}`;
  }).filter(hasText);
  const ratio = brewRatio(visit);
  if (calibration.length) {
    if (ratio.dose != null || ratio.yield != null) calibration.push(`Receta ${ratio.dose ?? "—"} g → ${ratio.yield ?? "—"} g · ratio ${ratio.ratio} · tiempo ${ratio.time ?? "—"} s`);
    if (visit.perfil) calibration.unshift(`Café: ${visit.perfil}`);
    if (visit.notasCata) calibration.push(visit.notasCata);
    sections.push({ title: "Calibración", lines: calibration });
  }
  const sensoryNames: Record<string, string> = { aroma: "Aroma", dulzor: "Dulzor", acidez: "Acidez", amargor: "Amargor", cuerpo: "Cuerpo", balance: "Balance", general: "Calidad general" };
  const sensory = Object.entries(visit.sens)
    .filter(([, score]) => score > 0)
    .map(([key, score]) => `${sensoryNames[key] || key}: ${score}/5`);
  if (sensory.length) sections.push({ title: "Evaluación sensorial", lines: sensory });
  const equipment = EQUIPMENT.filter(([id]) => visit.equipo[id]?.st).map(([id, name]) => {
    const reading = visit.equipo[id];
    const state = reading.st === "ok" ? "OK" : reading.st === "att" ? "Atención" : "N/A";
    return `${name}: ${state}${reading.obs ? ` — ${reading.obs}` : ""}`;
  });
  if (equipment.length || hasText(visit.recoTec)) sections.push({ title: "Equipo", lines: [...equipment, visit.recoTec].filter(hasText) });
  const techLines = [
    visit.tec.motivo.length ? `Motivo: ${visit.tec.motivo.join(", ")}` : "",
    visit.tec.equipos.length ? `Equipo: ${visit.tec.equipos.join(", ")}` : "",
    visit.tec.marca ? `Marca: ${visit.tec.marca}` : "",
    visit.tec.serial ? `Serial: ${visit.tec.serial}` : "",
    visit.tec.falla ? `Falla: ${visit.tec.falla}` : "",
    visit.tec.diag ? `Diagnóstico: ${visit.tec.diag}` : "",
    visit.tec.trabajo ? `Trabajo: ${visit.tec.trabajo}` : "",
    visit.tec.repuestos.filter((part) => hasText(part.n)).map((part) => `Repuesto: ${part.n}${part.c ? ` × ${part.c}` : ""}`).join("\n"),
    visit.tec.estado && visit.tec.estado in TECH_STATUS ? `Estado: ${TECH_STATUS[visit.tec.estado as keyof typeof TECH_STATUS]}` : "",
    visit.tec.proxMant ? `Próximo mantenimiento: ${longDate(visit.tec.proxMant)}` : "",
  ]
    .flatMap((line) => String(line).split("\n"))
    .filter(hasText);
  if (techLines.length) sections.push({ title: "Servicio técnico", lines: techLines });
  const trained = SKILLS.filter(([id]) => visit.skills[id] > 0).map(([id, name]) => `${name}: ${["Por reforzar", "En desarrollo", "Bueno", "Excelente"][visit.skills[id] - 1] || visit.skills[id]}`);
  if (trained.length || visit.capacitados.length) {
    sections.push({ title: "Capacitación", lines: [visit.capacitados.length ? `Personas: ${visit.capacitados.join(", ")}` : "", ...trained].filter(hasText) });
  }
  if (audience === "team" && (visit.com.perfiles.length || hasText(visit.com.consumo) || hasText(visit.oportunidades))) {
    sections.push({
      title: "Comercial (interno)",
      lines: [
        visit.com.perfiles.length ? `Perfiles: ${visit.com.perfiles.join(", ")}` : "",
        visit.com.consumo ? `Consumo: ${visit.com.consumo}` : "",
        visit.com.inventario ? `Inventario: ${visit.com.inventario}` : "",
        visit.com.estacion ? `Estación: ${visit.com.estacion}` : "",
        visit.com.solicitudes ? `Solicitudes: ${visit.com.solicitudes}` : "",
        visit.oportunidades ? `Oportunidades: ${visit.oportunidades}` : "",
      ].filter(hasText),
    });
  }
  const story = [visit.antes ? `Al llegar: ${visit.antes}` : "", visit.ajustes ? `Ajustes: ${visit.ajustes}` : "", visit.resultado ? `Resultado: ${visit.resultado}` : ""].filter(hasText);
  if (story.length) sections.push({ title: "Antes y después", lines: story });
  const result = visit.resultadoFinal && visit.resultadoFinal in RESULT ? RESULT[visit.resultadoFinal as keyof typeof RESULT] : null;
  const closing = [
    result ? `Resultado: ${result.name}. ${result.detail}` : "",
    visit.satisf ? `Satisfacción: ${visit.satisf}/5` : "",
    visit.positivo ? `Lo más positivo: ${visit.positivo}` : "",
    visit.comentarios ? `Comentarios: ${visit.comentarios}` : "",
    visit.plan.length ? `Plan: ${visit.plan.join(", ")}` : "",
    ...visit.acciones.filter((action) => hasText(action.a)).map((action) => `Acción: ${action.a}${action.r ? ` · ${action.r}` : ""}${action.f ? ` · ${longDate(action.f)}` : ""}`),
    visit.proxVisita ? `Próxima visita: ${longDate(visit.proxVisita)}` : "",
    visit.firmaClienteNombre ? `Recibió: ${visit.firmaClienteNombre}${visit.firmaClienteCargo ? ` · ${visit.firmaClienteCargo}` : ""}` : "",
  ].filter(hasText);
  if (closing.length) sections.push({ title: "Cierre", lines: closing });
  if (audience === "team" && hasText(visit.notaInterna)) sections.push({ title: "Nota interna", lines: [visit.notaInterna] });
  return sections;
}

const CSV_COLUMNS: [string, (visit: VisitRecord) => string][] = [
  ["Reporte", (visit) => reportNumber(visit)],
  ["Fecha", (visit) => visit.fecha],
  ["Nombre comercial", (visit) => visit.cliente],
  ["Razón social", (visit) => visit.razonSocial || ""],
  ["Punto / sede", (visit) => visit.sede],
  ["Dirección", (visit) => visit.direccion || ""],
  ["Ciudad", (visit) => visit.ciudad || ""],
  ["Zona", (visit) => visit.zona || ""],
  ["Visita No.", (visit) => visit.numVisita],
  ["Tipo de visitante", (visit) => visit.visitante],
  ["Responsable / diligenció", (visit) => visit.responsable],
  ["Técnico", (visit) => visit.tecnico || ""],
  ["Estado equipo", (visit) => (visit.tec.estado && visit.tec.estado in TECH_STATUS ? TECH_STATUS[visit.tec.estado as keyof typeof TECH_STATUS] : "")],
  ["Tipo de visita", (visit) => visit.tipos.join(" / ")],
  ["Perfil", (visit) => visit.perfil],
  ["Resultado", (visit) => (visit.resultadoFinal && visit.resultadoFinal in RESULT ? RESULT[visit.resultadoFinal as keyof typeof RESULT].name : "")],
  ["Satisfacción", (visit) => (visit.satisf ? String(visit.satisf) : "")],
  ["Próxima visita", (visit) => visit.proxVisita],
  ["Resumen", (visit) => visit.resumen],
  ["Oportunidades (interno)", (visit) => visit.oportunidades],
  ["Nota interna", (visit) => visit.notaInterna],
];

function csvCell(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function visitsCsv(visits: VisitRecord[]): string {
  const header = CSV_COLUMNS.map(([label]) => csvCell(label)).join(",");
  const rows = visits.map((visit) => CSV_COLUMNS.map(([, read]) => csvCell(read(visit))).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

export type CoverageState = "na" | "sin" | "venc" | "ok";

export type CoverageRow = {
  point: VisitPoint;
  owner: string;
  visitState: CoverageState;
  trainingState: CoverageState;
  overdueDays: number | null;
  dueThisWeek: boolean;
  visitedWeek: boolean;
  last: VisitRecord | null;
};

export type CoverageAlert = { row: CoverageRow; reasons: string[]; severity: number };

export type CoverageData = {
  start: string;
  end: string;
  asOf: string;
  kpi: {
    visits: number;
    points: number;
    onTime: number;
    overdue: number;
    never: number;
    withFrequency: number;
    satisfaction: number | null;
    due: number;
    done: number;
  };
  rows: CoverageRow[];
  alerts: CoverageAlert[];
  people: { name: string; role: string; visits: number; points: string[] }[];
  weekVisits: VisitRecord[];
};

export function ownerOfPoint(point: { commercial: string }): string {
  const member = matchTeam(point.commercial);
  return member && member.role === "Comercial" ? member.id : "none";
}

export function pointOfVisit(visit: VisitRecord, points: VisitPoint[]): VisitPoint | null {
  return points.find((point) => point.id === visit.clienteId) || points.find((point) => fold(point.tradeName) === fold(visit.cliente) && fold(point.pointName) === fold(visit.sede)) || null;
}

function isTraining(visit: VisitRecord): boolean {
  return visit.tipos.includes("Capacitación de baristas") || SKILLS.some(([id]) => (visit.skills || {})[id] > 0) || (visit.capacitados || []).length > 0;
}

export function weekData(visits: VisitRecord[], points: VisitPoint[], weekStart: string, segment = "todos", today = bogotaToday()): CoverageData {
  const start = mondayOf(weekStart);
  const end = addDays(start, 6);
  const asOf = end < today ? end : today;
  const finals = visits.filter((visit) => visit.status === "final" && visit.fecha && visit.fecha <= end);
  const tagged = finals.map((visit) => {
    const point = pointOfVisit(visit, points);
    const owner = point ? ownerOfPoint(point) : matchTeam(visit.planCli?.com || "")?.id || "none";
    return { visit, point, owner };
  });
  const inSegment = (owner: string) => segment === "todos" || owner === segment;
  const weekVisits = tagged.filter((item) => item.visit.fecha >= start && inSegment(item.owner)).map((item) => item.visit);
  const scoped = points.filter((point) => inSegment(ownerOfPoint(point)));
  const rows: CoverageRow[] = scoped.map((point) => {
    const history = tagged
      .filter((item) => item.point?.id === point.id)
      .map((item) => item.visit)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const last = history.length ? history[history.length - 1] : null;
    const lastTraining = [...history].reverse().find(isTraining) || null;
    const visitEvery = FREQ_DAYS[point.visitFrequency];
    const trainingEvery = FREQ_DAYS[point.trainingFrequency];
    const state = (previous: VisitRecord | null, every: number | undefined): CoverageState => {
      if (!every) return "na";
      if (!previous) return "sin";
      return daysBetween(addDays(previous.fecha, every), asOf) > 0 ? "venc" : "ok";
    };
    const overdueDays = last && visitEvery ? daysBetween(addDays(last.fecha, visitEvery), asOf) : null;
    return {
      point,
      owner: ownerOfPoint(point),
      visitState: state(last, visitEvery),
      trainingState: state(lastTraining, trainingEvery),
      overdueDays,
      dueThisWeek: Boolean(last && visitEvery && addDays(last.fecha, visitEvery) >= start && addDays(last.fecha, visitEvery) <= end),
      visitedWeek: history.some((visit) => visit.fecha >= start),
      last,
    };
  });
  const alerts: CoverageAlert[] = [];
  for (const row of rows) {
    const reasons: string[] = [];
    let severity = 0;
    const last = row.last;
    if (last) {
      if (last.resultadoFinal === "tec") {
        reasons.push("Requiere servicio técnico");
        severity = Math.max(severity, 3);
      }
      if (last.tec.estado === "fs") {
        reasons.push("Equipo fuera de servicio");
        severity = 3;
      }
      if (last.tec.estado === "obs") {
        reasons.push("Equipo operativo con observaciones");
        severity = Math.max(severity, 2);
      }
      if (last.resultadoFinal === "seg") {
        reasons.push("Quedó en seguimiento");
        severity = Math.max(severity, 2);
      }
      if (last.satisf > 0 && last.satisf <= 3) {
        reasons.push(`Satisfacción ${last.satisf}/5`);
        severity = Math.max(severity, last.satisf <= 2 ? 3 : 2);
      }
      const attention = EQUIPMENT.filter(([id]) => (last.equipo[id] || {}).st === "att").map(([, name]) => lowerFirst(name));
      if (attention.length) {
        reasons.push(`Equipo por atender: ${yList(attention.slice(0, 3))}${attention.length > 3 ? "…" : ""}`);
        severity = Math.max(severity, 2);
      }
      const late = last.acciones.filter((action) => hasText(action.a) && action.f && action.f < asOf);
      if (late.length) {
        reasons.push(`Acción con fecha cumplida: ${shortText(late[0].a, 50)}${late.length > 1 ? ` (+${late.length - 1})` : ""}`);
        severity = Math.max(severity, 2);
      }
      if (hasText(last.comentarios) && last.fecha >= start) {
        reasons.push(`Solicitud: ${shortText(last.comentarios, 70)}`);
        severity = Math.max(severity, 1);
      }
    }
    if (row.visitState === "venc") {
      reasons.push(`Visita vencida hace ${row.overdueDays} día${row.overdueDays === 1 ? "" : "s"}`);
      severity = Math.max(severity, (row.overdueDays || 0) > 14 ? 3 : 2);
    }
    if (row.trainingState === "venc") {
      reasons.push("Capacitación vencida");
      severity = Math.max(severity, 1);
    }
    if (reasons.length) alerts.push({ row, reasons, severity });
  }
  alerts.sort((a, b) => b.severity - a.severity || (b.row.overdueDays || 0) - (a.row.overdueDays || 0));
  const peopleMap = new Map<string, { name: string; role: string; visits: number; points: string[] }>();
  for (const visit of weekVisits) {
    const name = visit.visitante === "Técnico" ? visit.tecnico || "Técnico" : visit.responsable || "Sin nombre";
    const member = matchTeam(name);
    const role = visit.visitante === "Técnico" ? "Técnico" : member ? member.title : VISITOR_LABEL[visit.visitante as keyof typeof VISITOR_LABEL] || "";
    const key = fold(name);
    const current = peopleMap.get(key) || { name: member ? member.name : name, role, visits: 0, points: [] };
    current.visits += 1;
    const label = `${niceName(visit.cliente)}${visit.sede ? ` – ${visit.sede}` : ""}`;
    if (!current.points.includes(label)) current.points.push(label);
    peopleMap.set(key, current);
  }
  const scores = weekVisits.map((visit) => visit.satisf).filter((score) => score > 0);
  const withFrequency = rows.filter((row) => row.visitState !== "na");
  return {
    start,
    end,
    asOf,
    kpi: {
      visits: weekVisits.length,
      points: new Set(weekVisits.map((visit) => `${visit.cliente}|${visit.sede}`)).size,
      onTime: withFrequency.filter((row) => row.visitState === "ok").length,
      overdue: withFrequency.filter((row) => row.visitState === "venc").length,
      never: withFrequency.filter((row) => row.visitState === "sin").length,
      withFrequency: withFrequency.length,
      satisfaction: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      due: rows.filter((row) => row.dueThisWeek).length,
      done: rows.filter((row) => row.dueThisWeek && row.visitedWeek).length,
    },
    rows,
    alerts,
    people: [...peopleMap.values()].sort((a, b) => b.visits - a.visits),
    weekVisits,
  };
}

export { OWNER_LABEL };
