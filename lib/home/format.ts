import { cop, daysBetween, longDate } from "@/lib/utils";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "Lunes, 19 de octubre" para la cabecera de Inicio (inicial mayúscula, el resto en minúscula). */
export function weekdayLongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return longDate(iso);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${longDate(iso)}`;
}

/** Distancia en días en lenguaje natural: "hoy", "ayer", "hace 5 días", "mañana", "en 3 días". */
export function relativeDays(iso: string, asOf: string): string {
  const diff = daysBetween(asOf, iso);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  if (diff > 0) return `en ${diff} días`;
  return `hace ${-diff} días`;
}

/** Plural con número: plural(1, "pendiente") → "1 pendiente"; plural(2, "pendiente") → "2 pendientes". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** COP compacto para indicadores grandes: a partir del millón se muestra en "M" (por ejemplo "$ 442 M"). */
export function compactCop(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const millions = Math.round(value / 1_000_000);
    return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(millions)} M`;
  }
  return cop(value);
}

/** Une una lista en una frase: ["a", "b", "c"] → "a, b y c". */
export function joinSentence(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}
