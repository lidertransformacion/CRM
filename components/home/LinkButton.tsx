import * as React from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Enlace con aspecto de botón. Reemplaza `<Button asChild><Link/></Button>` mientras el `Slot`
 * de `Button` reciba dos hijos (spinner + children) y falle con un solo elemento.
 */
export function LinkButton({ className, variant, size, ...props }: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
