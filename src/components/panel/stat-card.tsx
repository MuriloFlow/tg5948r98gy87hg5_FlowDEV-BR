import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const ACCENTS: Record<Tone, { icon: string; bar: string }> = {
  neutral: { icon: "bg-ink-100 text-ink-500", bar: "from-ink-300/60" },
  success: { icon: "bg-emerald-50 text-emerald-600", bar: "from-emerald-400/60" },
  warning: { icon: "bg-amber-50 text-amber-600", bar: "from-amber-400/60" },
  danger: { icon: "bg-rose-50 text-rose-600", bar: "from-rose-400/60" },
  info: { icon: "bg-sky-50 text-sky-600", bar: "from-sky-400/60" },
  violet: { icon: "bg-brand-50 text-brand-600", bar: "from-brand-400/60" },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  trend,
  href,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  trend?: { value: number; label?: string } | null;
  href?: string;
  className?: string;
}) {
  const accent = ACCENTS[tone];

  const content = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)]",
        "transition-[box-shadow,border-color,transform] duration-200",
        href && "hover:-translate-y-px hover:border-ink-300 hover:shadow-[var(--shadow-raised)]",
        className
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
          accent.bar
        )}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
              accent.icon
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular text-ink-900">
        {value}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              trend.value > 0
                ? "bg-emerald-50 text-emerald-700"
                : trend.value < 0
                  ? "bg-rose-50 text-rose-700"
                  : "bg-ink-100 text-ink-500"
            )}
          >
            {trend.value > 0 ? (
              <ArrowUpRight className="size-3" />
            ) : trend.value < 0 ? (
              <ArrowDownRight className="size-3" />
            ) : null}
            {Math.abs(trend.value).toFixed(1).replace(".", ",")}%
          </span>
        )}
        {hint && <p className="truncate text-[11.5px] text-ink-400">{hint}</p>}
        {href && (
          <ArrowRight className="ml-auto size-3.5 shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-500" />
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none">
      {content}
    </Link>
  ) : (
    content
  );
}

export function StatGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 3 | 4;
}) {
  return (
    <div
      className={cn(
        "stagger grid gap-3 sm:grid-cols-2",
        columns === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
      )}
    >
      {children}
    </div>
  );
}
