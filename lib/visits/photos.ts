/** Optional R2 bucket. Absent in local SQLite and until the binding is added on the Worker. */
type PhotoBucket = {
  put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(keys: string | string[]): Promise<unknown>;
};

export async function visitPhotoBucket(): Promise<PhotoBucket | null> {
  if (process.env.VITEST) return null;
  try {
    const { env } = await import("cloudflare:workers");
    const bucket = (env as { VISIT_PHOTOS?: PhotoBucket }).VISIT_PHOTOS;
    if (!bucket || typeof bucket.put !== "function") return null;
    return bucket;
  } catch {
    return null;
  }
}

export function dataUrlBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || "");
  if (!match) return null;
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mime: match[1], bytes };
}

export function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
