import { storageLabel, storageLevel, STORAGE_LIMIT_BYTES } from "@/lib/storage/format";
import { cn } from "@/lib/utils";

const LEVEL_BAR = {
  ok: "bg-navy",
  warn: "bg-warn",
  critical: "bg-danger",
} as const;

const LEVEL_NOTE = {
  ok: "",
  warn: "Queda poco espacio",
  critical: "Queda muy poco espacio",
} as const;

/** Usage of the shared 10 GB R2 cap. Warns at 80% and 95%. */
export function StorageBar({ bytesUsed, limitBytes = STORAGE_LIMIT_BYTES, className }: { bytesUsed: number; limitBytes?: number; className?: string }) {
  const level = storageLevel(bytesUsed, limitBytes);
  const width = limitBytes <= 0 ? 100 : Math.min(100, (bytesUsed / limitBytes) * 100);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{storageLabel(bytesUsed)}</p>
        {LEVEL_NOTE[level] && <p className={cn("text-xs font-medium", level === "critical" ? "text-danger" : "text-hl-ink")}>{LEVEL_NOTE[level]}</p>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={storageLabel(bytesUsed)} aria-valuemin={0} aria-valuemax={limitBytes} aria-valuenow={bytesUsed}>
        <div className={cn("h-full rounded-full", LEVEL_BAR[level])} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
