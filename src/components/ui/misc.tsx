"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn, initials } from "@/lib/utils";
import { Button } from "./button";

/* ---------------------------------------------------------------- Switch -- */

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
        "border-2 border-transparent transition-colors duration-200",
        "data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-ink-300",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0",
          "transition-transform duration-200 ease-out",
          "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-ink-200 bg-white px-3.5 py-3 transition-colors hover:border-ink-300">
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={id} className="block cursor-pointer text-[13px] font-medium text-ink-800">
          {label}
        </label>
        {description && <p className="text-xs leading-relaxed text-ink-500">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

/* --------------------------------------------------------------- Tooltip -- */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-xs rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white",
            "shadow-[var(--shadow-raised)]",
            "data-[state=delayed-open]:animate-[scale-in_0.12s_ease-out]"
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-ink-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Tabs -- */

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "scrollbar-none flex items-center gap-1 overflow-x-auto border-b border-ink-200",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-ink-500",
        "transition-colors duration-150 hover:text-ink-800",
        "data-[state=active]:text-brand-600",
        "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
        "after:transition-colors after:duration-200 data-[state=active]:after:bg-brand-500",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-5 focus-visible:outline-none animate-fade-in", className)}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Avatar -- */

const AVATAR_TINTS = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
];

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "size-6 text-[10px]",
    sm: "size-8 text-[11px]",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
  };
  const tint =
    AVATAR_TINTS[
      Math.abs(name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % AVATAR_TINTS.length
    ];

  if (src) {
    return (
      // avatares vêm de URLs arbitrárias do usuário; next/image exigiria
      // liberar hosts remotos um a um
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-ink-200", sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/[0.04]",
        sizes[size],
        tint,
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------ Copy button -- */

export function CopyButton({
  value,
  label = "Copiar",
  size = "iconXs",
  variant = "ghost",
  className,
  showLabel,
}: {
  value: string;
  label?: string;
  size?: "iconXs" | "iconSm" | "xs" | "sm";
  variant?: "ghost" | "secondary" | "subtle";
  className?: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado para a área de transferência");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      aria-label={label}
      title={label}
      className={className}
    >
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
      {showLabel && (copied ? "Copiado" : label)}
    </Button>
  );
}

/* -------------------------------------------------------------- Skeleton -- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} aria-hidden />;
}

/* ----------------------------------------------------------- Empty state -- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-ink-200 bg-ink-50/30 px-6 py-14 text-center",
        className
      )}
    >
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-ink-400 shadow-[var(--shadow-card)] [&_svg]:size-5">
          {icon}
        </span>
      )}
      <div className="max-w-sm space-y-1.5">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        {description && <p className="text-[13px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- Progress -- */

export function Progress({
  value,
  tone = "brand",
  className,
}: {
  value: number;
  tone?: "brand" | "success" | "danger" | "warning";
  className?: string;
}) {
  const tones = {
    brand: "bg-brand-500",
    success: "bg-emerald-500",
    danger: "bg-rose-500",
    warning: "bg-amber-500",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-100", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ Code block -- */

export function Code({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800",
        className
      )}
    >
      {children}
    </code>
  );
}

export function CodeBlock({
  code,
  language,
  filename,
  className,
}: {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-ink-800 bg-ink-900", className)}>
      {(filename || language) && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="font-mono text-[11px] text-white/50">{filename ?? language}</span>
          <CopyButton value={code} variant="ghost" size="iconXs" className="text-white/60 hover:bg-white/10 hover:text-white" />
        </div>
      )}
      <pre className="scrollbar-thin overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-[12.5px] leading-relaxed text-ink-100">{code}</code>
      </pre>
    </div>
  );
}
