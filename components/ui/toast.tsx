"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "ok" | "danger" | "info" | "warn";
export type ToastInput = { title: string; description?: string; tone?: ToastTone; duration?: number };
type Toast = ToastInput & { id: number };

const ToastContext = React.createContext<{ toast: (input: ToastInput) => void } | null>(null);

const ICONS: Record<ToastTone, React.ReactNode> = {
  ok: <CircleCheck className="size-4 text-ok" />,
  danger: <CircleAlert className="size-4 text-danger" />,
  info: <Info className="size-4 text-info" />,
  warn: <TriangleAlert className="size-4 text-hl-ink" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);
  const dismiss = React.useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = ++counter.current;
      setItems((current) => [...current.slice(-3), { id, tone: "ok", ...input }]);
      window.setTimeout(() => dismiss(id), input.duration ?? (input.tone === "danger" ? 6000 : 3500));
    },
    [dismiss],
  );
  const value = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed z-[100] flex flex-col gap-2 max-sm:inset-x-4 max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-4 sm:right-4 sm:w-[min(360px,calc(100vw-2rem))]" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} role="status" className="anim-toast-in pointer-events-auto flex items-start gap-3 rounded-lg border border-line-2 bg-surface px-3.5 py-3 shadow-pop">
            <span className="mt-0.5 shrink-0">{ICONS[item.tone ?? "ok"]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs text-ink-2">{item.description}</p>}
            </div>
            <button onClick={() => dismiss(item.id)} aria-label="Cerrar aviso" className="rounded p-0.5 text-ink-3 hover:bg-accent-soft hover:text-ink">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `const { toast } = useToast(); toast({ title: "Guardado" })` */
export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast requiere <ToastProvider> en el layout");
  return context;
}

/** Indicador compacto de guardado para cabeceras: "Guardando…", "Guardado", "Error". */
export function SaveIndicator({ state, className }: { state: "saved" | "saving" | "error" | "idle"; className?: string }) {
  if (state === "idle") return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", state === "error" ? "text-danger" : "text-ink-3", className)} aria-live="polite">
      <span className={cn("size-1.5 rounded-full", state === "error" ? "bg-danger" : state === "saving" ? "animate-pulse bg-hl-ink" : "bg-ok")} />
      {state === "saving" ? "Guardando…" : state === "error" ? "No se pudo guardar" : "Guardado"}
    </span>
  );
}
