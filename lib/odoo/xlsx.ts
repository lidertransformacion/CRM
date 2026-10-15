import fs from "node:fs";
import zlib from "node:zlib";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "row" || name === "c" || name === "si" || name === "r",
  trimValues: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textNode(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return decodeEntities(String(value));
  if (Array.isArray(value)) return value.map(textNode).join("");
  if (typeof value === "object" && value && "#text" in value) return decodeEntities(String((value as { "#text"?: unknown })["#text"] ?? ""));
  return "";
}

function unzip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressed);
    const out = method === 0 ? data : zlib.inflateRawSync(data);
    files.set(name, out.toString("utf8"));
    offset = dataStart + compressed;
  }
  return files;
}

function sharedStrings(xml: string): string[] {
  const doc = parser.parse(xml) as { sst?: { si?: { t?: unknown; r?: { t?: unknown } | { t?: unknown }[] }[] } };
  return asArray(doc.sst?.si).map((item) => {
    if (item.t != null) return textNode(item.t);
    return asArray(item.r).map((run) => textNode(run.t)).join("");
  });
}

type Cell = { "@_r"?: string; "@_t"?: string; v?: string | number; is?: { t?: unknown } };

export function excelSerialToIso(serial: number): string {
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  const utc = Date.UTC(1899, 11, 30) + whole * 86400000;
  const date = new Date(utc);
  const day = date.toISOString().slice(0, 10);
  if (fraction < 0.0001) return day;
  const minutes = Math.round(fraction * 1440);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${day}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function cellValue(cell: Cell, shared: string[]): string {
  if (cell["@_t"] === "s" && cell.v != null) return shared[Number(cell.v)] ?? "";
  if (cell["@_t"] === "inlineStr") return textNode(cell.is?.t);
  if (cell["@_t"] === "b") return String(cell.v) === "1" ? "TRUE" : "FALSE";
  if (cell.v != null) return decodeEntities(String(cell.v));
  return "";
}

export function readXlsxRows(filePath: string): Record<string, string>[] {
  const files = unzip(fs.readFileSync(filePath));
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error(`No worksheet in ${filePath}`);
  const shared = files.has("xl/sharedStrings.xml") ? sharedStrings(files.get("xl/sharedStrings.xml")!) : [];
  const doc = parser.parse(sheet) as { worksheet?: { sheetData?: { row?: { c?: Cell | Cell[] }[] } } };
  const matrix = asArray(doc.worksheet?.sheetData?.row).map((row) => {
    const values: Record<string, string> = {};
    for (const cell of asArray(row.c)) {
      const letter = (cell["@_r"] ?? "").replace(/[0-9]/g, "");
      if (!letter) continue;
      values[letter] = cellValue(cell, shared);
    }
    return values;
  });
  if (!matrix.length) return [];
  const headers = matrix[0];
  const letters = Object.keys(headers).sort((a, b) => (a.length - b.length) || a.localeCompare(b));
  return matrix.slice(1).map((row) => {
    const record: Record<string, string> = {};
    for (const letter of letters) {
      const header = headers[letter] || letter;
      record[header] = row[letter] ?? "";
    }
    return record;
  });
}
