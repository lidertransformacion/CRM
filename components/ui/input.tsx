import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-9 max-sm:h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink shadow-[inset_0_1px_0_rgba(24,43,85,.02)] outline-none transition-colors placeholder:text-ink-3 hover:border-[rgba(24,43,85,.28)] focus:border-navy-2 focus:ring-2 focus:ring-navy-2/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-2 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}
