import path from "node:path";

/** Prefer the files on disk. The worker bundle falls back to lib/import/embedded.ts. */
export async function loadImportBytes(fileOrName: string): Promise<Buffer> {
  const base = path.basename(fileOrName);
  try {
    const fs = await import("node:fs");
    const full = path.isAbsolute(fileOrName) ? fileOrName : path.join(process.cwd(), "data", "imports", base);
    if (fs.existsSync(full)) return fs.readFileSync(full);
  } catch {
    // Workers may not expose node:fs.
  }
  const { importBlobs } = await import("@/lib/import/embedded");
  const encoded = importBlobs[base];
  if (!encoded) throw new Error(`No está el archivo de semilla ${base}.`);
  return Buffer.from(encoded, "base64");
}

export async function loadImportText(fileOrName: string): Promise<string> {
  return new TextDecoder().decode(await loadImportBytes(fileOrName));
}
