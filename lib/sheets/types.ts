export const SHEET_HEADERS = [
  "Nº de serie",
  "Nombre del equipo",
  "Categoría del equipo",
  "Codigo Tienda",
  "ID",
  "idnum",
  "Ubicación",
  "Ubicación Comercial cliente hospitality",
  "Proveedor",
  "Referencia de Proveedor",
  "Modelo",
  "Fecha expiración Garantía",
  "Frecuencia Mantenimiento [dias]",
  "Duracción Mantenimiento [horas]",
] as const;

export type SheetHeader = (typeof SHEET_HEADERS)[number];

/** Columns owned by formulas on the live sheet. The adapter never writes them. */
export const FORMULA_HEADERS = new Set<string>(["Codigo Tienda", "idnum"]);

export type SheetRow = {
  rowNumber: number;
  serial: string;
  cells: Record<string, string>;
};

export type SheetSnapshot = {
  spreadsheetId: string;
  tabName: string;
  headers: string[];
  rows: SheetRow[];
};

export type CellChange = {
  column: string;
  from: string;
  to: string;
};

export type PushUpdate = {
  serial: string;
  rowNumber: number;
  changes: CellChange[];
};

export type PushInsert = {
  serial: string;
  values: Record<string, string>;
};

export type PushPlan = {
  updates: PushUpdate[];
  inserts: PushInsert[];
  /** Always empty. Rows are never deleted. */
  deletes: [];
  formulaNotes: { serial: string; column: string; localValue: string }[];
};

export type PullChange = {
  serial: string;
  column: string;
  local: string;
  sheet: string;
};

export type PullPlan = {
  updates: { serial: string; changes: PullChange[] }[];
  inserts: { serial: string; cells: Record<string, string> }[];
  /** Local rows missing from the sheet stay. They are not deleted. */
  localOnly: string[];
};

export type ApplyResult = {
  written: boolean;
  reason: string;
  updates: number;
  inserts: number;
};

export type EquipmentSyncRow = {
  serial: string;
  sheetSerial: string | null;
  name: string;
  category: string;
  siteId: string;
  siteName: string;
  siteSeq: number;
  storeCode: string;
  supplier: string;
  supplierReference: string;
  model: string;
  warrantyUntil: string | null;
  warrantyRaw: string;
  everyDays: number | null;
  hoursLabel: string;
  locationRaw: string;
  clientName: string | null;
  address: string;
  city: string;
  dirty: string[];
  sheetCells: Record<string, string>;
};
