import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrap({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card)]",
        className
      )}
    >
      <div className="scrollbar-thin overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-full border-collapse text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-ink-200 bg-ink-50/60 text-left", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  align = "left",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-500",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-ink-200/70", className)} {...props} />;
}

export function TR({
  className,
  clickable,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors duration-100",
        clickable && "cursor-pointer hover:bg-ink-50/70",
        !clickable && "hover:bg-ink-50/40",
        className
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  align = "left",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-[13px] text-ink-700",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}

export function TableEmpty({
  colSpan,
  icon,
  title,
  description,
  action,
}: {
  colSpan: number;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center animate-fade-in">
          {icon && (
            <span className="flex size-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400 [&_svg]:size-5">
              {icon}
            </span>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-800">{title}</p>
            {description && <p className="text-[13px] leading-relaxed text-ink-500">{description}</p>}
          </div>
          {action}
        </div>
      </td>
    </tr>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <div
                className="shimmer h-3.5 rounded"
                style={{ width: c === 0 ? "60%" : c === cols - 1 ? "40%" : "75%" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
