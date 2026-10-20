/** Hard cap for every R2 object the CRM stores. */
export const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

export type StorageLevel = "ok" | "warn" | "critical";

const ONE_GB = 1024 * 1024 * 1024;

export function formatGb(bytes: number): string {
  if (bytes === STORAGE_LIMIT_BYTES) return "10 GB";
  const gb = bytes / ONE_GB;
  if (gb <= 0) return "0 GB";
  if (gb < 0.01) return `${gb.toFixed(3)} GB`;
  const digits = gb >= 10 ? 1 : 2;
  const text = gb.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${text} GB`;
}

/** Label shown on the usage bar: "X GB de 10 GB usados". */
export function storageLabel(bytesUsed: number): string {
  return `${formatGb(bytesUsed)} de 10 GB usados`;
}

export function storageLevel(bytesUsed: number, limit = STORAGE_LIMIT_BYTES): StorageLevel {
  if (limit <= 0 || bytesUsed / limit >= 0.95) return "critical";
  if (bytesUsed / limit >= 0.8) return "warn";
  return "ok";
}

export function quotaExceededMessage(bytesUsed: number): string {
  return `No hay espacio suficiente. ${storageLabel(bytesUsed)}. Este archivo superaría el límite de 10 GB.`;
}
