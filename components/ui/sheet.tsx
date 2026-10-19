"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Panel lateral (drawer). Úsalo para ver o editar un registro sin perder la lista detrás.
 * <Sheet open onOpenChange><SheetContent title description size><SheetBody/><SheetFooter/></SheetContent></Sheet>
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const SIZES = { sm: "sm:max-w-[420px]", md: "sm:max-w-[560px]", lg: "sm:max-w-[760px]", xl: "sm:max-w-[960px]" } as const;

export function SheetContent({
  title,
  description,
  eyebrow,
  actions,
  size = "md",
  side = "right",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  size?: keyof typeof SIZES;
  side?: "right" | "left";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-fade-in fixed inset-0 z-40 bg-navy-deep/45 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full flex-col bg-surface shadow-pop outline-none max-sm:[&>div:first-child]:safe-top",
          side === "right" ? "anim-sheet-in-right right-0 border-l border-line-2" : "anim-sheet-in-left left-0 border-r border-line-2",
          SIZES[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-2 px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
            <DialogPrimitive.Title data-slot="title" className="font-sans text-base font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description data-slot="description" className="mt-0.5 text-xs text-ink-3">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">Panel lateral</DialogPrimitive.Description>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <DialogPrimitive.Close className="rounded-md p-1.5 text-ink-3 hover:bg-accent-soft hover:text-ink" aria-label="Cerrar">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line-2 bg-surface-2 px-5 py-3 max-sm:[&>button]:flex-1", className)} {...props} />;
}
