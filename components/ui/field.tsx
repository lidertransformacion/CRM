import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de formulario: etiqueta visible arriba, ayuda y error debajo.
 * Usar siempre en vez de etiquetas sueltas para que todos los formularios se vean igual.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
  inline = false,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
  /** Etiqueta y control en la misma fila (para interruptores o campos cortos). */
  inline?: boolean;
}) {
  return (
    <div className={cn("min-w-0", inline ? "flex items-center justify-between gap-3" : "space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      <div className={cn(!inline && "min-w-0")}>{children}</div>
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Rejilla de campos: 1 columna en móvil, N en escritorio. */
export function FieldGrid({ cols = 2, className, children }: { cols?: 1 | 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  const map = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" } as const;
  return <div className={cn("grid grid-cols-1 gap-3", map[cols], className)}>{children}</div>;
}

/** Agrupa campos relacionados bajo un título corto. */
export function FieldSection({ title, description, className, children }: { title: string; description?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div>
        <h3 className="font-sans text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="text-xs text-ink-3">{description}</p>}
      </div>
      {children}
    </section>
  );
}
