import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estado vacío explicativo: dice qué falta y qué hacer, nunca un espacio en blanco. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-12", className)}>
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-accent-soft text-ink-2 [&_svg]:size-5">{icon ?? <Inbox />}</span>
      <p className="font-sans text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
