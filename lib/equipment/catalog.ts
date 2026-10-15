export const SITES = [
  { id: "122B", name: "122B" },
  { id: "CL109", name: "Calle 109" },
  { id: "CL79", name: "Calle 79" },
  { id: "CL85", name: "Calle 85" },
  { id: "CL93", name: "Calle 93" },
  { id: "COM", name: "Comercial" },
  { id: "FIC48", name: "FIC48" },
  { id: "GET", name: "Getsemaní" },
  { id: "SP", name: "Specialized" },
  { id: "USQ", name: "Usaquén" },
  { id: "ZG", name: "Zona G" },
] as const;

export const SITE_NAME_BY_ID = Object.fromEntries(SITES.map((site) => [site.id, site.name]));

export const COMODATO_STATUSES = [
  { id: "en_tienda", label: "En tienda" },
  { id: "en_comodato", label: "En comodato" },
  { id: "en_bodega", label: "En bodega" },
  { id: "en_mantenimiento", label: "En mantenimiento" },
  { id: "devuelto", label: "Devuelto" },
  { id: "baja", label: "De baja" },
] as const;

export const CITIES = ["Bogotá", "Cartagena", "Cali", "Usaquén"] as const;

export const CATEGORY_ALIASES: Record<string, string> = {
  "filtro de agua": "Filtros de agua",
  "filtros de agua": "Filtros de agua",
};

export const SUPPLIER_ALIASES: Record<string, string> = {
  "amor perfecto": "Amor Perfecto",
  "dalla corte": "Dalla Corte",
  dallacorte: "Dalla Corte",
  comek: "Comek",
  "comek sas": "Comek",
};

export function canonicalCategory(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function canonicalSupplier(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return SUPPLIER_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function siteById(id: string) {
  return SITES.find((site) => site.id === id) ?? null;
}

export function storeCode(siteId: string, seq: number): string {
  return `${siteId}-${String(seq).padStart(3, "0")}`;
}

export function assetNumber(seq: number): string {
  return `ACT-${String(seq).padStart(4, "0")}`;
}

export function statusLabel(id: string): string {
  return COMODATO_STATUSES.find((status) => status.id === id)?.label ?? id;
}
