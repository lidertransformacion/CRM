/** Catalogs and staff roster from the hospitality visit report. */

export const VISIT_TYPES = [
  "Capacitación de baristas",
  "Calibración de café",
  "Calibración de equipo",
  "Servicio técnico",
  "Mantenimiento preventivo",
  "Seguimiento",
  "Nueva cuenta / instalación",
  "Visita comercial",
  "Otro",
] as const;

export const OBJECTIVES = [
  "Mejorar espresso",
  "Ajustar molino",
  "Calibrar máquina",
  "Capacitación",
  "Recetas y estándares",
  "Leche / latte art",
  "Solucionar falla de equipo",
  "Limpieza / mantenimiento",
  "Flujo de trabajo",
  "Revisión de consumo",
  "Presentación de portafolio",
] as const;

export const PROFILES = ["PAZ", "LIBRE", "PUNK / ROCK", "Descafeinado", "Bourbon Rosado"] as const;

export type CalSpec = { id: string; name: string; unit: string; tolerance: number | null; text: boolean };

/** Tolerances compare the objective with the result after the visit. */
export const CAL: CalSpec[] = [
  { id: "molino", name: "Molino", unit: "ajuste", tolerance: null, text: true },
  { id: "dosis", name: "Dosis", unit: "g", tolerance: 0.5, text: false },
  { id: "yield", name: "Rendimiento", unit: "g", tolerance: 2, text: false },
  { id: "tiempo", name: "Tiempo", unit: "seg", tolerance: 3, text: false },
  { id: "temp", name: "Temperatura", unit: "°C", tolerance: 1, text: false },
  { id: "pres", name: "Presión", unit: "bar", tolerance: 0.5, text: false },
  { id: "tds", name: "TDS bebida", unit: "%", tolerance: 0.1, text: false },
  { id: "ext", name: "Extracción", unit: "%", tolerance: 1, text: false },
];

export const SENSORY = [
  ["aroma", "Aroma"],
  ["dulzor", "Dulzor"],
  ["acidez", "Acidez"],
  ["amargor", "Amargor"],
  ["cuerpo", "Cuerpo"],
  ["balance", "Balance"],
  ["general", "Calidad general"],
] as const;

export const EQUIPMENT_GROUPS: { group: string; items: [string, string][] }[] = [
  {
    group: "Máquina de espresso",
    items: [
      ["maq_limp", "Limpieza general"],
      ["backflush", "Backflush realizado"],
      ["grupos", "Cabezas de grupo"],
      ["empaques", "Empaques y duchas"],
      ["temp", "Temperatura"],
      ["pres", "Presión"],
      ["vapor", "Lanza de vapor"],
      ["fugas", "Sin fugas"],
    ],
  },
  {
    group: "Molino",
    items: [
      ["mol_limp", "Limpieza"],
      ["muelas", "Muelas / cuchillas"],
      ["dosif", "Consistencia de dosis"],
      ["mol_cons", "Consistencia de molienda"],
      ["mol_cal", "Calibración"],
      ["reten", "Retención"],
    ],
  },
  {
    group: "Otros equipos",
    items: [
      ["filtro", "Filtro de agua"],
      ["bascula", "Báscula"],
      ["knock", "Knock box"],
      ["nevera", "Nevera"],
      ["batch", "Batch brewer / métodos"],
      ["capsulas", "Máquina de cápsulas"],
      ["super", "Superautomática"],
    ],
  },
];

export const EQUIPMENT = EQUIPMENT_GROUPS.flatMap((group) => group.items.map(([id, name]) => [id, name, group.group] as const));

export const SKILLS: [string, string][] = [
  ["esp", "Preparación de espresso"],
  ["mol", "Ajuste del molino"],
  ["dos", "Dosificación / distribución"],
  ["tamp", "Tamping"],
  ["eval", "Evaluación del espresso"],
  ["leche", "Vaporización de leche"],
  ["latte", "Latte art"],
  ["rec", "Recetas y estándares"],
  ["bebidas", "Bebidas de la carta"],
  ["limp", "Limpieza"],
  ["oper", "Operación del equipo"],
  ["flujo", "Flujo de trabajo / velocidad"],
  ["serv", "Servicio al cliente"],
];

export const SKILL_LEVELS = ["Por reforzar", "En desarrollo", "Bueno", "Excelente"] as const;
export const SKILL_SHORT = ["Reforzar", "Desarrollo", "Bueno", "Excelente"] as const;

export const TECH_EQUIPMENT = ["Máquina de espresso", "Molino", "Máquina de cápsulas", "Superautomática", "Filtro de agua", "Batch brewer", "Otro"] as const;
export const TECH_REASONS = ["Mantenimiento preventivo", "Correctivo / falla", "Instalación", "Retiro de equipo", "Revisión de garantía"] as const;
export const TECH_STATUS = {
  op: "Operativo",
  obs: "Operativo con observaciones",
  fs: "Fuera de servicio",
} as const;

export const MILKS = ["Entera", "Deslactosada", "Semidescremada", "Vegetal"] as const;

export const PLAN_OPTIONS = [
  "No requiere seguimiento",
  "Capacitación adicional",
  "Servicio técnico",
  "Repuestos",
  "Ajuste de café",
  "Ajuste de receta",
  "Filtro / tratamiento de agua",
  "Seguimiento comercial",
  "Nueva visita",
] as const;

export const VISITOR_ROLES = ["Barista", "Comercial", "Técnico"] as const;

export const VISITOR_LABEL: Record<(typeof VISITOR_ROLES)[number], string> = {
  Barista: "Barista / entrenador",
  Comercial: "Asesor comercial",
  Técnico: "Servicio técnico",
};

export const RESULT = {
  exc: { name: "Excelente", detail: "Equipo calibrado y personal capacitado" },
  bue: { name: "Bueno", detail: "Ajustes menores recomendados" },
  seg: { name: "Seguimiento", detail: "Se programa una nueva intervención" },
  tec: { name: "Servicio técnico", detail: "Requiere atención especializada" },
} as const;

export type ResultKey = keyof typeof RESULT;

/** Days until the next visit is due, keyed by the frequency written on the point. */
export const FREQ_DAYS: Record<string, number> = {
  SEMANAL: 7,
  QUINCENAL: 15,
  MENSUAL: 30,
  "CADA 2 MESES": 60,
  "CADA 3 MESES": 90,
  "CADA 6 MESES": 180,
  "SEMESTRAL VIRTUAL": 182,
  ANUAL: 365,
};

export type TeamMember = {
  id: string;
  name: string;
  title: string;
  role: "Barista" | "Comercial" | "Técnico";
  email: string;
  phone: string;
};

/** Hospitality roster used to sign the client email and to assign coverage. */
export const TEAM: TeamMember[] = [
  { id: "lospina", name: "Luis Eduardo Ospina Rivera", title: "Barista OOS", role: "Barista", email: "", phone: "" },
  { id: "jtriana", name: "Juan Felipe Triana Serrano", title: "Barista OOS", role: "Barista", email: "", phone: "" },
  { id: "adiaz", name: "Alejandro Diaz Barrera", title: "Business Developer", role: "Comercial", email: "businessdevelopercol@libertariocoffee.com", phone: "+57 310 5771556" },
  { id: "jhiguera", name: "Juanita Higuera Téllez", title: "Business Developer", role: "Comercial", email: "businessdevelopercol2@libertariocoffee.com", phone: "+57 320 9601733" },
];

export const COMMERCIALS = TEAM.filter((member) => member.role === "Comercial");

/** WhatsApp number that receives the compact visit code. Digits only, country code included. */
export const WHATSAPP_DESTINATION = "573209601733";

export const OWNER_LABEL: Record<string, string> = {
  adiaz: "Alejandro Diaz",
  jhiguera: "Juanita Higuera",
  none: "Sin comercial asignado",
};

export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slug(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== "";
}

export function pendingText(value: string): boolean {
  return /por completar|por confirmar|sin definir/i.test(value || "");
}

/** Drops placeholder addresses the catalog marks as still to validate. */
export function cleanPointText(value: string): string {
  if (pendingText(value)) return "";
  return String(value || "")
    .replace(/\s*[–-]\s*VALIDAR\s*$/i, "")
    .trim();
}

export function matchTeam(name: string): TeamMember | null {
  const words = fold(name)
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (!words.length) return null;
  return (
    TEAM.find((member) => {
      const target = fold(member.name);
      return words.filter((word) => target.includes(word)).length >= Math.min(2, words.length);
    }) ?? null
  );
}

export function parseNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}
