import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-[#d9deea] bg-white px-3 text-sm outline-none placeholder:text-[#98a2b3] focus:border-[var(--blue)] focus:ring-2 focus:ring-blue/20",
        className,
      )}
      {...props}
    />
  );
}
