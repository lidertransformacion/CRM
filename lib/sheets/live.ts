import { readEnvSync } from "@/lib/env";
import { planPull, planPush } from "@/lib/sheets/diff";
import type { ApplyResult, EquipmentSyncRow, PullPlan, PushPlan, SheetSnapshot } from "@/lib/sheets/types";
import type { SheetsAdapter } from "@/lib/sheets/adapter";

export type LiveConfig = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  tabName: string;
};

function requireEnabled() {
  if (readEnvSync("SHEETS_SYNC_ENABLED") !== "true") {
    throw new Error("Google Sheets sync is disabled.");
  }
}

export function readSheetsConfig(): LiveConfig {
  requireEnabled();
  const clientEmail = readEnvSync("GOOGLE_SHEETS_CLIENT_EMAIL").trim();
  const privateKey = readEnvSync("GOOGLE_SHEETS_PRIVATE_KEY").replace(/\\n/g, "\n");
  const spreadsheetId = readEnvSync("GOOGLE_SHEETS_SPREADSHEET_ID").trim();
  const tabName = readEnvSync("GOOGLE_SHEETS_TAB").trim() || "Listado Equipos";
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("Faltan GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY o GOOGLE_SHEETS_SPREADSHEET_ID.");
  }
  return { clientEmail, privateKey, spreadsheetId, tabName };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    throw new Error("GOOGLE_SHEETS_PRIVATE_KEY debe ser PKCS8 (BEGIN PRIVATE KEY).");
  }
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** RS256 service-account assertion. Web Crypto so the Worker does not need node:crypto. */
export async function signServiceAccountJwt(config: Pick<LiveConfig, "clientEmail" | "privateKey">, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textToBase64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(config.privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function googleAccessToken(config: LiveConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const assertion = await signServiceAccountJwt(config);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("No se pudo autenticar con Google.");
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google no devolvió un token.");
  return json.access_token;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export class LiveGoogleSheetsAdapter implements SheetsAdapter {
  readonly mode = "live" as const;
  private config: LiveConfig;

  constructor() {
    this.config = readSheetsConfig();
  }

  async pull(): Promise<SheetSnapshot> {
    requireEnabled();
    const token = await googleAccessToken(this.config);
    const range = encodeURIComponent(this.config.tabName);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error("No se pudo leer la hoja.");
    const json = (await response.json()) as { values?: string[][] };
    const values = json.values ?? [];
    const headers = (values[0] ?? []).map((header) => String(header));
    const serialIndex = headers.indexOf("Nº de serie");
    const rows = values.slice(1).map((cells, index) => {
      const record: Record<string, string> = {};
      headers.forEach((header, cellIndex) => {
        record[header] = String(cells[cellIndex] ?? "");
      });
      return { rowNumber: index + 2, serial: serialIndex >= 0 ? record["Nº de serie"] ?? "" : "", cells: record };
    });
    return { spreadsheetId: this.config.spreadsheetId, tabName: this.config.tabName, headers, rows: rows.filter((row) => row.serial) };
  }

  planPush(_local: EquipmentSyncRow[]): PushPlan {
    throw new Error("planPush en vivo necesita un snapshot fresco. Usa pull() y planPush().");
  }

  planPull(_local: EquipmentSyncRow[]): PullPlan {
    throw new Error("planPull en vivo necesita un snapshot fresco. Usa pull() y planPull().");
  }

  async apply(plan: PushPlan): Promise<ApplyResult> {
    requireEnabled();
    if (plan.deletes.length > 0) throw new Error("El adaptador no borra filas.");
    const snapshot = await this.pull();
    const bySerial = new Map(snapshot.rows.map((row) => [row.serial.trim(), row]));
    const data: { range: string; values: string[][] }[] = [];
    for (const update of plan.updates) {
      const fresh = bySerial.get(update.serial.trim());
      if (!fresh) throw new Error(`No está el serial ${update.serial}. No se escribe por número de fila.`);
      for (const change of update.changes) {
        const index = snapshot.headers.indexOf(change.column);
        if (index < 0) continue;
        const letter = columnLetter(index);
        data.push({ range: `${this.config.tabName}!${letter}${fresh.rowNumber}`, values: [[change.to]] });
      }
    }
    let nextRow = snapshot.rows.reduce((max, row) => Math.max(max, row.rowNumber), 1) + 1;
    for (const insert of plan.inserts) {
      const values = snapshot.headers.map((header) => insert.values[header] ?? "");
      const end = columnLetter(snapshot.headers.length - 1);
      data.push({ range: `${this.config.tabName}!A${nextRow}:${end}${nextRow}`, values: [values] });
      nextRow += 1;
    }
    if (!data.length) return { written: true, reason: "No había cambios.", updates: 0, inserts: 0 };
    const token = await googleAccessToken(this.config);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
      },
    );
    if (!response.ok) throw new Error("Google Sheets rechazó la escritura.");
    return { written: true, reason: "Hoja actualizada por serial.", updates: plan.updates.length, inserts: plan.inserts.length };
  }
}

export { planPull, planPush };
