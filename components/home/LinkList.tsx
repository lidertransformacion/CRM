import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { LinkButton } from "@/components/home/LinkButton";
import { cn } from "@/lib/utils";

/** Lista compacta de filas enlazadas para las tarjetas de Inicio. Cada fila es un enlace completo. */
export function LinkList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-line-2", className)} {...props} />;
}

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
      <Link href={href} className={cn("group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2", className)}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-ink-3">{meta}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        <ChevronRight className="hidden size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 sm:block" aria-hidden />
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
