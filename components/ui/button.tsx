import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-2/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-navy text-crema hover:bg-navy-2 shadow-[0_1px_0_rgba(0,0,0,.08)]",
        secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
        soft: "bg-accent-soft text-ink hover:bg-[rgba(24,43,85,.14)]",
        ghost: "text-ink-2 hover:bg-accent-soft hover:text-ink",
        danger: "bg-danger text-white hover:bg-[#a81f1f]",
        "danger-soft": "bg-danger-soft text-danger hover:bg-[#f8d9d9]",
        link: "h-auto px-0 text-navy-2 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs max-sm:h-9",
        md: "h-9 px-3.5 text-sm max-sm:h-11",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9 max-sm:h-11 max-sm:w-11",
        "icon-sm": "h-8 w-8 max-sm:h-10 max-sm:w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  // Con `asChild` el Slot de Radix exige un único hijo (p. ej. <Link>), así que no se añade el spinner.
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
