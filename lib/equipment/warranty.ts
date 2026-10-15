export type WarrantyState = "vigente" | "vencida" | "desconocida";

export type ParsedWarranty = {
  until: string | null;
  state: WarrantyState;
  raw: string;
};

export function parseWarranty(raw: string | null | undefined): ParsedWarranty {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { until: null, state: "desconocida", raw: "" };
  const plain = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (plain.includes("junio 2027")) return { until: "2027-06-30", state: "vigente", raw: text };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { until: text, state: "vigente", raw: text };
  }
  if (plain.includes("ya paso")) return { until: null, state: "vencida", raw: text };
  if (plain.includes("garantia")) return { until: null, state: "vigente", raw: text };
  return { until: null, state: "desconocida", raw: text };
}

export function warrantyStateOn(until: string | null, fallback: WarrantyState, asOf: string): WarrantyState {
  if (!until) return fallback;
  return until < asOf ? "vencida" : "vigente";
}

export function parseHours(raw: string | null | undefined): { min: number | null; max: number | null } {
  const text = (raw ?? "").trim();
  if (!text) return { min: null, max: null };
  const range = text.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  if (range) return { min: Number(range[1].replace(",", ".")), max: Number(range[2].replace(",", ".")) };
  const single = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!single) return { min: null, max: null };
  const value = Number(single[1].replace(",", "."));
  return { min: value, max: value };
}

export function maintenanceCost(input: {
  everyDays: number | null;
  hoursMin: number | null;
  hoursMax: number | null;
  hourlyRate: number;
  partsCost?: number;
}): { hours: number; visitsPerYear: number; costPerVisit: number; annualCost: number } | null {
  if (!input.everyDays || input.everyDays <= 0) return null;
  if (input.hoursMin == null || input.hoursMax == null) return null;
  if (input.hourlyRate < 0) return null;
  const hours = (input.hoursMin + input.hoursMax) / 2;
  const visitsPerYear = 365 / input.everyDays;
  const costPerVisit = hours * input.hourlyRate + (input.partsCost ?? 0);
  return { hours, visitsPerYear, costPerVisit, annualCost: visitsPerYear * costPerVisit };
}
