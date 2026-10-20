import { HttpError } from "@/lib/auth/users";
import { legalFilesBucket, type LegalBucket } from "@/lib/legal/storage";
import { STORAGE_LIMIT_BYTES, quotaExceededMessage, storageLevel, type StorageLevel } from "@/lib/storage/format";
import type { SqlDb } from "@/lib/sql/types";

export type StorageBucket = LegalBucket & {
  list(options?: { cursor?: string; limit?: number; prefix?: string }): Promise<{
    objects: { key: string; size: number }[];
    truncated?: boolean;
    cursor?: string;
  }>;
};

/**
 * Mail attachments and visit photos share `MAIL_FILES` (`crm-libertario-mail`).
 * Visit objects use the `visits/` prefix. Contracts stay on `LEGAL_FILES`.
 */
export const EXTRA_R2_BINDINGS = [{ binding: "MAIL_FILES", label: "Correos y visitas" }] as const;

export type Usage = {
  bytesUsed: number;
  limitBytes: number;
  percent: number;
  level: StorageLevel;
};

export type BucketUsage = { binding: string; label: string; bytes: number; objects: number };

let extraBuckets: Record<string, StorageBucket | null> | undefined;
let limitOverride: number | undefined;

export function setExtraStorageBucketsForTests(buckets: Record<string, StorageBucket | null> | null) {
  extraBuckets = buckets ?? undefined;
}

export function setStorageLimitForTests(bytes: number | null) {
  limitOverride = bytes == null ? undefined : bytes;
}

export function storageLimitBytes(): number {
  return limitOverride ?? STORAGE_LIMIT_BYTES;
}

async function ensureRow(db: SqlDb) {
  await db.run(
    `INSERT INTO storage_usage (id, bytes_used, updated_at)
     SELECT 1, 0, '1970-01-01T00:00:00.000Z'
     WHERE NOT EXISTS (SELECT 1 FROM storage_usage WHERE id = 1)`,
  );
}

export async function readUsage(db: SqlDb): Promise<Usage> {
  await ensureRow(db);
  const row = await db.get<{ bytes_used: number }>("SELECT bytes_used FROM storage_usage WHERE id = 1");
  const bytesUsed = Number(row?.bytes_used ?? 0);
  const limitBytes = storageLimitBytes();
  const percent = limitBytes <= 0 ? 100 : Math.round((bytesUsed / limitBytes) * 100);
  return { bytesUsed, limitBytes, percent, level: storageLevel(bytesUsed, limitBytes) };
}

/** Atomic increment. Rejects the upload when the new total would pass the cap. */
export async function reserveBytes(db: SqlDb, bytes: number): Promise<void> {
  if (!Number.isFinite(bytes) || bytes < 0) throw new HttpError(400, "El tamaño del archivo no es válido.");
  await ensureRow(db);
  const limit = storageLimitBytes();
  const result = await db.run(
    `UPDATE storage_usage SET bytes_used = bytes_used + ?, updated_at = ? WHERE id = 1 AND bytes_used + ? <= ?`,
    [bytes, new Date().toISOString(), bytes, limit],
  );
  if (result.changes !== 1) {
    const usage = await readUsage(db);
    throw new HttpError(413, quotaExceededMessage(usage.bytesUsed));
  }
}

/** Call when an R2 object is removed, or when a reserved upload did not land. */
export async function releaseBytes(db: SqlDb, bytes: number): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  await ensureRow(db);
  await db.run(
    `UPDATE storage_usage SET bytes_used = MAX(0, bytes_used - ?), updated_at = ? WHERE id = 1`,
    [bytes, new Date().toISOString()],
  );
}

async function workersBinding(name: string): Promise<StorageBucket | null> {
  if (extraBuckets && name in extraBuckets) return extraBuckets[name] ?? null;
  if (process.env.VITEST) return null;
  try {
    const { env } = await import("cloudflare:workers");
    const bucket = (env as Record<string, StorageBucket | undefined>)[name];
    return bucket && typeof bucket.list === "function" ? bucket : null;
  } catch {
    return null;
  }
}

export async function boundStorageBuckets(): Promise<{ binding: string; label: string; bucket: StorageBucket }[]> {
  const found: { binding: string; label: string; bucket: StorageBucket }[] = [];
  const legal = await legalFilesBucket();
  if (legal && typeof (legal as StorageBucket).list === "function") {
    found.push({ binding: "LEGAL_FILES", label: "Contratos", bucket: legal as StorageBucket });
  }
  for (const extra of EXTRA_R2_BINDINGS) {
    const bucket = await workersBinding(extra.binding);
    if (bucket) found.push({ binding: extra.binding, label: extra.label, bucket });
  }
  return found;
}

async function sumBucket(bucket: StorageBucket): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 20000; page += 1) {
    const listed = await bucket.list({ cursor, limit: 1000 });
    for (const object of listed.objects) {
      bytes += Number(object.size) || 0;
      objects += 1;
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return { bytes, objects };
}

/** Replace the counter with the sum of every object in the bound R2 buckets. */
export async function recalculateUsage(db: SqlDb): Promise<{ bytesUsed: number; buckets: BucketUsage[] }> {
  const buckets = await boundStorageBuckets();
  const breakdown: BucketUsage[] = [];
  let total = 0;
  for (const item of buckets) {
    const summed = await sumBucket(item.bucket);
    total += summed.bytes;
    breakdown.push({ binding: item.binding, label: item.label, bytes: summed.bytes, objects: summed.objects });
  }
  await ensureRow(db);
  await db.run("UPDATE storage_usage SET bytes_used = ?, updated_at = ? WHERE id = 1", [total, new Date().toISOString()]);
  return { bytesUsed: total, buckets: breakdown };
}
