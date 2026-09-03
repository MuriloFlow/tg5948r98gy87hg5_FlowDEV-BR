import * as React from "react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, TONE_DOT, type StatusMeta, type Tone } from "@/lib/labels";

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
  size = "md",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({
  meta,
  dot = true,
  size = "md",
  className,
}: {
  meta: StatusMeta;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Badge tone={meta.tone} dot={dot} size={size} className={className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

/** Indicador "ao vivo" com anel pulsante — usado no header do painel. */
export function LiveDot({ active = true, className }: { active?: boolean; className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)} aria-hidden>
      {active && (
        <span className="absolute inline-flex size-full rounded-full bg-emerald-400 [animation:var(--animate-pulse-ring)]" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          active ? "bg-emerald-500" : "bg-ink-300"
        )}
      />
    </span>
  );
}
