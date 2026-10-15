import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40",
  {
    variants: {
      variant: {
        default: "bg-[var(--blue)] text-white hover:bg-[#2746d6]",
        navy: "bg-[var(--navy)] text-white hover:bg-[#1b2748]",
        outline: "border border-[#d5d9e4] bg-white text-[var(--ink)] hover:bg-[#f7f8fb]",
        ghost: "text-[var(--ink)] hover:bg-black/5",
        danger: "bg-rose-600 text-white hover:bg-rose-700",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
