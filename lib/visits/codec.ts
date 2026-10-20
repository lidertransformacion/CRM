import { normalizeVisit, type VisitRecord } from "@/lib/visits/model";

const PREFIX = "LIBV1.";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/**
 * Compact code the phone app already produces. Photos are omitted and signatures
 * are reduced to a flag so the text fits in a WhatsApp message.
 */
export async function encodeVisitCode(visit: VisitRecord): Promise<string> {
  const copy = normalizeVisit(structuredClone(visit));
  const encoded = {
    ...copy,
    fotos: [] as VisitRecord["fotos"],
    firmaBarista: visit.firmaBarista ? "1" : "",
    firmaCliente: visit.firmaCliente ? "1" : "",
  };
  const packed = await deflateRaw(new TextEncoder().encode(JSON.stringify(encoded)));
  return PREFIX + bytesToBase64Url(packed);
}

export async function decodeVisitCode(code: string): Promise<VisitRecord> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error("El código no empieza por LIBV1.");
  const json = await inflateRaw(base64UrlToBytes(trimmed.slice(PREFIX.length)));
  const parsed = JSON.parse(json) as Partial<VisitRecord>;
  if (parsed.firmaBarista === "1") parsed.firmaBarista = "";
  if (parsed.firmaCliente === "1") parsed.firmaCliente = "";
  return normalizeVisit(parsed);
}

export function findVisitCodes(text: string): string[] {
  return text.match(/LIBV1\.[A-Za-z0-9_-]+/g) ?? [];
}
