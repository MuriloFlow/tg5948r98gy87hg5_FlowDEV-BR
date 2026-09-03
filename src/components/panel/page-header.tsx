import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  meta,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 space-y-3", className)}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-500 transition-colors hover:text-brand-600"
        >
          <ChevronLeft className="size-3.5" />
          {backLabel ?? "Voltar"}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.022em] text-ink-900">
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
