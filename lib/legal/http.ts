import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import type { Actor } from "@/lib/legal/access";
import { getDb } from "@/lib/db";
import type { SqlDb } from "@/lib/sql/types";

export async function legalContext(request: Request): Promise<{ db: SqlDb; actor: Actor }> {
  const db = await getDb();
  const session = await requireSession(request, db);
  return {
    db,
    actor: {
      uid: session.uid,
      email: session.email,
      role: session.role,
      ip: request.headers.get("cf-connecting-ip"),
      userAgent: request.headers.get("user-agent"),
    },
  };
}

export function legalError(error: unknown): Response {
  return jsonError(error);
}

export async function pdfFromForm(form: FormData): Promise<{ name: string; mime: string; bytes: Uint8Array }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Adjunta un PDF.");
  return { name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function formJson<T>(form: FormData, key: string, fallback: T): T {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new HttpError(400, "El formulario trae un dato que no se pudo leer.");
  }
}

export function optionalId(value: unknown): number | null {
  if (value == null || value === "" || value === "null") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "La carpeta no es válida.");
  return id;
}
