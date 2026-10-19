import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium leading-none", {
  variants: {
    tone: {
      neutral: "border-line-2 bg-surface-2 text-ink-2",
      accent: "border-navy bg-navy text-crema",
      ok: "border-transparent bg-ok-soft text-ok",
      warn: "border-transparent bg-warn-soft text-hl-ink",
      danger: "border-transparent bg-danger-soft text-danger",
      info: "border-transparent bg-info-soft text-info",
      outline: "border-line bg-transparent text-ink-2",
    },
    size: {
      sm: "h-5 px-2 text-[11px]",
      md: "h-6 px-2.5 text-xs",
    },
  },
  defaultVariants: { tone: "neutral", size: "md" },
});

export function Badge({ className, tone, size, dot, children, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
