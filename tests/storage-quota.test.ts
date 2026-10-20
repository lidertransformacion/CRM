import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import type { Actor } from "@/lib/legal/access";
import { deleteFile, storePdf, uploadDriveFile } from "@/lib/legal/drive";
import { setLegalFilesBucketForTests, type LegalBucket } from "@/lib/legal/storage";
import { STORAGE_LIMIT_BYTES, storageLabel, storageLevel } from "@/lib/storage/format";
import { deleteMailFile, saveMailFile, setMailFilesBucketForTests } from "@/lib/mail/files";
import { readUsage, recalculateUsage, releaseBytes, reserveBytes, setExtraStorageBucketsForTests, type StorageBucket } from "@/lib/storage/quota";
import { blankVisit } from "@/lib/visits/model";
import { deleteVisit, saveVisit } from "@/lib/visits/store";
import { wrapDatabaseSync } from "@/lib/sql/node";
import type { SqlDb } from "@/lib/sql/types";

class MemoryBucket implements LegalBucket, StorageBucket {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer | Uint8Array | string) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    this.objects.set(key, copy);
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return {
      body: new ReadableStream(),
      size: copy.byteLength,
      async arrayBuffer() {
        return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
      },
    };
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async list(options?: { cursor?: string; limit?: number }) {
    const keys = [...this.objects.keys()].sort();
    const start = options?.cursor ? Number(options.cursor) : 0;
    const limit = options?.limit ?? 1000;
    const slice = keys.slice(start, start + limit);
    const next = start + slice.length;
    return {
      objects: slice.map((key) => ({ key, size: this.objects.get(key)?.byteLength ?? 0 })),
      truncated: next < keys.length,
      cursor: String(next),
    };
  }
}

async function tempDb(): Promise<{ file: string; db: SqlDb }> {
  const file = path.join(os.tmpdir(), `crm-quota-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  return { file, db: wrapDatabaseSync(await openDatabase(file)) };
}

describe("storage quota", () => {
  const created: string[] = [];

  afterEach(() => {
    setLegalFilesBucketForTests(null);
    setExtraStorageBucketsForTests(null);
    setMailFilesBucketForTests(undefined);
    for (const file of created) fs.rmSync(file, { force: true });
    created.length = 0;
  });

  it("labels the 10 GB cap and warns at 80 and 95 percent", () => {
    expect(storageLabel(0)).toBe("0 GB de 10 GB usados");
    expect(storageLabel(STORAGE_LIMIT_BYTES)).toBe("10 GB de 10 GB usados");
    expect(storageLabel(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB de 10 GB usados");
    expect(storageLevel(STORAGE_LIMIT_BYTES * 0.8 - 1)).toBe("ok");
    expect(storageLevel(STORAGE_LIMIT_BYTES * 0.8)).toBe("warn");
    expect(storageLevel(STORAGE_LIMIT_BYTES * 0.95)).toBe("critical");
  });

  it("rejects an upload that would pass 10 GB and frees space when a file is removed", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    const bucket = new MemoryBucket();
    setLegalFilesBucketForTests(bucket);
    await reserveBytes(db, STORAGE_LIMIT_BYTES);
    const actor: Actor = { uid: 1, email: "admin@libertariocoffee.com", role: "admin", ip: null, userAgent: "vitest" };
    const bytes = new TextEncoder().encode("%PDF-1.4 lleno");
    await expect(uploadDriveFile(db, actor, { name: "lleno.pdf", mime: "application/pdf", bytes })).rejects.toMatchObject({ status: 413 });
    await expect(uploadDriveFile(db, actor, { name: "lleno.pdf", mime: "application/pdf", bytes })).rejects.toThrow(/10 GB/);
    expect(bucket.objects.size).toBe(0);
    expect((await readUsage(db)).bytesUsed).toBe(STORAGE_LIMIT_BYTES);

    await releaseBytes(db, bytes.byteLength);
    const stored = await uploadDriveFile(db, actor, { name: "cabe.pdf", mime: "application/pdf", bytes });
    expect((await readUsage(db)).bytesUsed).toBe(STORAGE_LIMIT_BYTES);
    await deleteFile(db, actor, stored.id);
    expect(bucket.objects.has(stored.r2_key)).toBe(false);
    expect((await readUsage(db)).bytesUsed).toBe(STORAGE_LIMIT_BYTES - bytes.byteLength);
  });

  it("keeps signed bytes in the quota and rebuilds the counter from every bucket", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    const contracts = new MemoryBucket();
    const mail = new MemoryBucket();
    setLegalFilesBucketForTests(contracts);
    setExtraStorageBucketsForTests({ MAIL_FILES: mail });
    const actor: Actor = { uid: 1, email: "admin@libertariocoffee.com", role: "admin", ip: null, userAgent: "vitest" };
    const bytes = new TextEncoder().encode("%PDF-1.4 firmado");
    const stored = await storePdf(db, actor, { name: "firmado.pdf", mime: "application/pdf", bytes, kind: "contract_signed" });
    expect(stored.kind).toBe("contract_signed");
    await deleteFile(db, actor, stored.id);
    expect(contracts.objects.has(stored.r2_key)).toBe(true);
    expect((await readUsage(db)).bytesUsed).toBe(bytes.byteLength);

    await mail.put("mail/a", new Uint8Array(5));
    await contracts.put("files/extra", new Uint8Array(7));
    await reserveBytes(db, 1000);
    const rebuilt = await recalculateUsage(db);
    expect(rebuilt.buckets.map((item) => item.label)).toEqual(["Contratos", "Correos y visitas"]);
    expect(rebuilt.bytesUsed).toBe(bytes.byteLength + 7 + 5);
    expect((await readUsage(db)).bytesUsed).toBe(bytes.byteLength + 7 + 5);
  });

  it("reserves mail attachments and visit photos in the same bucket and releases them", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    const mail = new MemoryBucket();
    setMailFilesBucketForTests(mail);
    setExtraStorageBucketsForTests({ MAIL_FILES: mail });
    const saved = await saveMailFile(db, 4, { filename: "logo.png", contentType: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) });
    expect(saved.r2_key?.startsWith("mail/4/")).toBe(true);
    expect((await readUsage(db)).bytesUsed).toBe(4);

    const visit = blankVisit({
      id: "visit-quota-1",
      status: "borrador",
      cliente: "CAFE",
      sede: "Norte",
      fotos: [{ tag: "Antes", src: "data:image/jpeg;base64,AAAA" }],
    });
    await saveVisit(db, visit, 4);
    const photoKey = [...mail.objects.keys()].find((key) => key.startsWith("visits/visit-quota-1/"));
    expect(photoKey).toBeTruthy();
    const photoBytes = mail.objects.get(photoKey!)!.byteLength;
    expect((await readUsage(db)).bytesUsed).toBe(4 + photoBytes);

    await saveVisit(db, visit, 4);
    expect((await readUsage(db)).bytesUsed).toBe(4 + photoBytes);

    await deleteMailFile(db, 4, saved.id);
    await deleteVisit(db, visit.id);
    expect(mail.objects.size).toBe(0);
    expect((await readUsage(db)).bytesUsed).toBe(0);

    const rebuilt = await recalculateUsage(db);
    expect(rebuilt.buckets.map((item) => item.label)).toEqual(["Correos y visitas"]);
    expect(rebuilt.bytesUsed).toBe(0);
  });
});
