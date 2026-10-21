import type { ContractStatus, ContractType, NovedadKind, SignerRole } from "@/lib/legal/contracts";

export const TYPE_OPTIONS: { value: ContractType; label: string }[] = [
  { value: "comodato", label: "Comodato" },
  { value: "suministro", label: "Suministro" },
  { value: "confidencialidad", label: "Confidencialidad" },
  { value: "otro", label: "Otro" },
];

export const STATUS_OPTIONS: { value: ContractStatus; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "in_signature", label: "En firma" },
  { value: "signed", label: "Firmado" },
  { value: "active", label: "Vigente" },
  { value: "expired", label: "Vencido" },
  { value: "terminated", label: "Terminado" },
];

export const NOVEDAD_OPTIONS: { value: NovedadKind; label: string }[] = [
  { value: "nota", label: "Nota" },
  { value: "otrosi", label: "Otrosí" },
  { value: "renovacion", label: "Renovación" },
  { value: "vencimiento", label: "Vencimiento" },
  { value: "incumplimiento", label: "Incumplimiento" },
  { value: "terminacion", label: "Terminación" },
];

export const SIGNER_OPTIONS: { value: SignerRole; label: string }[] = [
  { value: "comercial", label: "Comercial" },
  { value: "legal", label: "Legal" },
  { value: "gerencia", label: "Gerencia" },
  { value: "externo", label: "Cliente (externo)" },
];

export function typeLabel(value: string): string {
  return TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function novedadLabel(value: string): string {
  return NOVEDAD_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function signerLabel(value: string): string {
  return SIGNER_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function statusTone(value: string): "neutral" | "ok" | "warn" | "danger" | "info" {
  if (value === "active" || value === "signed") return "ok";
  if (value === "in_signature") return "warn";
  if (value === "expired") return "danger";
  if (value === "terminated") return "neutral";
  return "info";
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
