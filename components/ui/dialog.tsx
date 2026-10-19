"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Diálogo centrado para confirmaciones y formularios cortos.
 * <Dialog open onOpenChange><DialogContent title description><DialogBody/><DialogFooter/></DialogContent></Dialog>
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;

const SIZES = { sm: "max-w-[440px]", md: "max-w-[600px]", lg: "max-w-[780px]", xl: "max-w-[960px]" } as const;

export function DialogContent({
  title,
  description,
  size = "md",
  className,
  children,
  hideClose,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof SIZES;
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-fade-in fixed inset-0 z-40 bg-navy-deep/45 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          // Escritorio: centrado. Móvil: hoja que sube desde abajo, ancho completo y esquinas superiores redondeadas.
          "fixed left-1/2 z-50 flex flex-col overflow-hidden border border-line-2 bg-surface shadow-pop outline-none",
          "sm:anim-pop-in sm:top-1/2 sm:max-h-[88vh] sm:w-[calc(100%-1.5rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
          "max-sm:anim-sheet-in-up max-sm:bottom-0 max-sm:w-full max-sm:max-h-[92dvh] max-sm:-translate-x-1/2 max-sm:rounded-t-2xl max-sm:border-b-0",
          SIZES[size],
          className,
        )}
        {...props}
      >
        {title ? (
          <div className="flex items-start justify-between gap-3 border-b border-line-2 px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-sans text-base font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-xs text-ink-3">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Diálogo</DialogPrimitive.Description>
              )}
            </div>
            {!hideClose && (
              <DialogPrimitive.Close className="rounded-md p-1.5 text-ink-3 hover:bg-accent-soft hover:text-ink" aria-label="Cerrar">
                <X className="size-4" />
              </DialogPrimitive.Close>
            )}
          </div>
        ) : (
          <DialogPrimitive.Description className="sr-only">Diálogo</DialogPrimitive.Description>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line-2 bg-surface-2 px-5 py-3 max-sm:[&>button]:flex-1", className)} {...props} />;
}
