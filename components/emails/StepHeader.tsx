import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabecera numerada de cada paso del flujo: círculo con el número (o un check cuando está listo) y título.
 * Se usa como `title` de un CardHeader, así que no renderiza su propio encabezado.
 */
export function StepHeader({ step, title, hint, done = false, className }: { step: number; title: string; hint?: string; done?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-start gap-3", className)}>
      <span
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-ok text-white" : "bg-navy text-crema")}
        aria-label={done ? `Paso ${step}, listo` : `Paso ${step}`}
      >
        {done ? <Check className="size-4" aria-hidden /> : step}
      </span>
      <span className="min-w-0">
        <span className="block font-sans text-[15px] font-semibold leading-7 text-ink">{title}</span>
        {hint && <span className="block text-xs font-normal text-ink-3">{hint}</span>}
      </span>
    </span>
  );
}
