import { parseCsv } from "@/lib/csv";
import type { SheetSnapshot } from "@/lib/sheets/types";

export function snapshotFromCsv(text: string, tabName = "Listado Equipos"): SheetSnapshot {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = (table[0] ?? []).map((header) => header.trim());
  const serialIndex = headers.findIndex((header) => header === "Nº de serie");
  if (serialIndex < 0) throw new Error("El CSV no tiene la columna Nº de serie.");
  const rows = table.slice(1).map((cells, index) => {
    const record: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      record[header] = (cells[cellIndex] ?? "").replace(/\s+/g, " ").trim();
    });
    return {
      rowNumber: index + 2,
      serial: record["Nº de serie"] ?? "",
      cells: record,
    };
  });
  return {
    spreadsheetId: "local-csv-snapshot",
    tabName,
    headers,
    rows: rows.filter((row) => row.serial),
  };
}
