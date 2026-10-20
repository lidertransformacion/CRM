export type UploadedFile = { id: string; filename: string; contentType: string; size: number };

export async function uploadMailFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/mail/files", { method: "POST", body: form });
  const payload = (await response.json()) as { file?: UploadedFile; error?: string };
  if (!response.ok || !payload.file) throw new Error(payload.error || "No se pudo subir el archivo.");
  return payload.file;
}

export async function deleteMailFile(id: string): Promise<void> {
  const response = await fetch(`/api/mail/files/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "No se pudo quitar el archivo.");
  }
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
