import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { LinkButton } from "@/components/home/LinkButton";
import { cn } from "@/lib/utils";

/** Lista compacta de filas enlazadas para las tarjetas de Inicio. Cada fila es un enlace completo. */
export function LinkList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-line-2", className)} {...props} />;
}

/**
 * Fila tocable. En escritorio: título y meta a la izquierda, `aside` y chevron a la derecha.
 * En móvil (< sm) la fila se parte en dos líneas: título (hasta dos renglones) + meta con el chevron
 * siempre visible, y debajo los badges o fechas de `aside` a todo el ancho. Altura mínima táctil de 44 px.
 */
export function LinkRow({
  href,
  title,
  meta,
  aside,
  className,
}: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Bloque derecho: badges, fechas o cifras. No debe contener otros enlaces. */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group flex min-h-11 items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 max-sm:flex-wrap max-sm:gap-y-2",
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink max-sm:line-clamp-2 sm:truncate">{title}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-ink-3">{meta}</p>}
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-ink-3 transition-opacity sm:order-last sm:opacity-0 sm:group-hover:opacity-100"
          aria-hidden
        />
        {aside && <div className="flex min-w-0 shrink-0 items-center gap-2 max-sm:basis-full max-sm:flex-wrap max-sm:gap-x-3 max-sm:gap-y-1.5">{aside}</div>}
      </Link>
    </li>
  );
}

/** Enlace "Ver todos (N)" para la esquina de una tarjeta. */
export function SeeAll({ href, count, label = "Ver todos" }: { href: string; count?: number; label?: string }) {
  return (
    <LinkButton href={href} variant="link" size="sm">
      {label}
      {count != null ? ` (${count})` : ""}
      <ArrowRight />
    </LinkButton>
  );
}
