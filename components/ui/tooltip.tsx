"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
}

/** <Tooltip content="Explicación corta"><button>…</button></Tooltip> — el hijo debe aceptar ref. */
export function Tooltip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  if (!content) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className={cn("anim-fade-in z-[90] max-w-[260px] rounded-md bg-navy-deep px-2.5 py-1.5 text-xs leading-snug text-crema shadow-pop", className)}>
          {content}
          <TooltipPrimitive.Arrow className="fill-navy-deep" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
