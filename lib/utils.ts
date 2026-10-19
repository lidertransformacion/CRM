import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Colores de marca definidos en app/globals.css. Sin esta lista, tailwind-merge no sabe que
// `text-crema` es un color y lo descarta al combinarlo con un tamaño como `text-sm`.
const BRAND_COLORS = [
  "navy", "navy-2", "navy-deep", "crema", "crema-2", "gris", "amarillo",
  "bg", "bg-2", "surface", "surface-2", "ink", "ink-2", "ink-3", "line", "line-2",
  "accent", "accent-2", "accent-ink", "accent-soft", "hl", "hl-ink",
  "ok", "ok-soft", "warn", "warn-soft", "danger", "danger-soft", "info", "info-soft",
];

const twMerge = extendTailwindMerge({
  extend: { theme: { color: BRAND_COLORS, shadow: ["card", "pop"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(): string {
  return crypto.randomUUID();
}

export function todayIso(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LONG_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${SHORT_MONTHS[m - 1]}`;
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${LONG_MONTHS[m - 1]}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function cop(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicShortName(title: string): string {
  const idx = title.indexOf(" — ");
  return idx === -1 ? title : title.slice(0, idx);
}

export function displaySeller(name: string | null | undefined): string {
  if (!name) return "Sin vendedor";
  const trimmed = name.trim();
  if (!trimmed.includes(",")) return trimmed;
  const [surnames, given] = trimmed.split(",").map((part) => part.trim());
  const first = given?.split(/\s+/)[0] ?? "";
  const last = surnames?.split(/\s+/)[0] ?? "";
  const nice = (part: string) =>
    part
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  return `${nice(first)} ${nice(last)}`.trim();
}
