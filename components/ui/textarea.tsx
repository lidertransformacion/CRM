import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/input";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}
