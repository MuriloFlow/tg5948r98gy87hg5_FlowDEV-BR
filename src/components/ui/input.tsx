"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const base = [
  "w-full rounded-lg bg-white text-sm text-ink-900",
  "ring-1 ring-inset ring-ink-200 placeholder:text-ink-400",
  "transition-[box-shadow,border-color] duration-150",
  "hover:ring-ink-300",
  "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0",
  "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400",
  "aria-[invalid=true]:ring-rose-400 aria-[invalid=true]:focus:ring-rose-500",
].join(" ");

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: React.ReactNode;
  suffix?: React.ReactNode;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefixIcon, suffix, invalid, ...props }, ref) => {
    if (prefixIcon || suffix) {
      return (
        <div className="relative flex items-center">
          {prefixIcon && (
            <span className="pointer-events-none absolute left-3 flex text-ink-400 [&_svg]:size-4">
              {prefixIcon}
            </span>
          )}
          <input
            ref={ref}
            aria-invalid={invalid || undefined}
            className={cn(
              base,
              "h-9.5 px-3 py-2",
              prefixIcon && "pl-9",
              suffix && "pr-11",
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 flex items-center text-xs text-ink-400">
              {suffix}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(base, "h-9.5 px-3 py-2", className)}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(base, "min-h-[84px] resize-y px-3 py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { NativeSelect } from "@/components/ui/select";

/** Campo monetário que trabalha em centavos e formata em tempo real. */
export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, "value" | "onChange"> & {
    value: number;
    onValueChange: (value: number) => void;
  }
>(({ value, onValueChange, className, ...props }, ref) => {
  const display = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 text-sm font-medium text-ink-400">
        R$
      </span>
      <input
        ref={ref}
        inputMode="numeric"
        value={display}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onValueChange(Number(digits) / 100);
        }}
        className={cn(base, "h-9.5 py-2 pl-9 pr-3 text-right font-medium tabular", className)}
        {...props}
      />
    </div>
  );
});
CurrencyInput.displayName = "CurrencyInput";
