import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Cabecera de cada pantalla: eyebrow + título serif + descripción + acciones a la derecha.
 * `children` va debajo y sirve para la barra de filtros.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="text-[28px] leading-tight text-ink sm:text-[32px]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Fila de filtros y acciones secundarias. */
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}
