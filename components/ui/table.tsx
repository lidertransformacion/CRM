import * as React from "react";
import { cn } from "@/lib/utils";

/** Tabla de datos: cabecera pegajosa, filas con hover y la opción de hacerlas clicables. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />;
}
export function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("overflow-auto rounded-xl border border-line-2 bg-surface shadow-card", className)} {...props} />;
}
export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-[1] bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3", className)} {...props} />;
}
export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-line-2", className)} {...props} />;
}
export function TR({ className, interactive, selected, ...props }: React.ComponentProps<"tr"> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      className={cn(interactive && "cursor-pointer transition-colors hover:bg-surface-2", selected && "bg-info-soft hover:bg-info-soft", className)}
      aria-selected={selected}
      {...props}
    />
  );
}
export function TH({ className, align, ...props }: React.ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return <th className={cn("px-3 py-2.5 font-medium first:pl-4 last:pr-4", align === "right" && "text-right", align === "center" && "text-center", className)} {...props} />;
}
export function TD({ className, align, ...props }: React.ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return <td className={cn("px-3 py-2.5 align-middle first:pl-4 last:pr-4", align === "right" && "num text-right", align === "center" && "text-center", className)} {...props} />;
}
