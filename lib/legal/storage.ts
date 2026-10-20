export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export type LegalBucket = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<LegalObject | null>;
  delete(key: string): Promise<void>;
  list?(options?: { cursor?: string; limit?: number; prefix?: string }): Promise<{
    objects: { key: string; size: number }[];
    truncated?: boolean;
    cursor?: string;
  }>;
};

export type LegalObject = {
  body: ReadableStream;
  size?: number;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
};

let testBucket: { bucket: LegalBucket | null } | undefined;

/** Tests inject a bucket. Production reads the LEGAL_FILES binding. */
export function setLegalFilesBucketForTests(bucket: LegalBucket | null) {
  testBucket = { bucket };
}

export async function legalFilesBucket(): Promise<LegalBucket | null> {
  if (testBucket) return testBucket.bucket;
  if (process.env.VITEST) return null;
  try {
    const { env } = await import("cloudflare:workers");
    const bucket = (env as { LEGAL_FILES?: LegalBucket }).LEGAL_FILES;
    return bucket ?? null;
  } catch {
    return null;
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(value: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(value));
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
