"use client";

import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "transition-[background-color,box-shadow,color,transform,border-color] duration-150 ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500/60",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:translate-y-px",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-brand-500 text-white shadow-xs",
          "hover:bg-brand-600 hover:shadow-[0_1px_2px_rgb(10_37_64/0.08),0_4px_12px_-2px_rgb(99_91_255/0.35)]",
        ].join(" "),
        secondary: [
          "bg-white text-ink-800 ring-1 ring-inset ring-ink-200 shadow-xs",
          "hover:bg-ink-50 hover:ring-ink-300",
        ].join(" "),
        ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        subtle: "bg-ink-100 text-ink-700 hover:bg-ink-200",
        danger: [
          "bg-rose-600 text-white shadow-xs",
          "hover:bg-rose-700 hover:shadow-[0_4px_12px_-2px_rgb(225_29_72/0.35)]",
        ].join(" "),
        dangerGhost: "text-rose-600 hover:bg-rose-50",
        success: "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700",
        link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "h-7 rounded-md px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 rounded-lg px-3 text-[13px] [&_svg]:size-4",
        md: "h-9.5 rounded-lg px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 rounded-xl px-5 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 rounded-lg [&_svg]:size-4",
        iconSm: "size-8 rounded-lg [&_svg]:size-4",
        iconXs: "size-7 rounded-md [&_svg]:size-3.5",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild, loading, icon, iconRight, children, disabled, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size, block }), className)}
          {...props}
        >
          {icon}
          {/* O Slot aceita só um filho: o Slottable indica onde enxertar o conteúdo. */}
          <Slottable>{children}</Slottable>
          {iconRight}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
        {children}
        {!loading && iconRight}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
