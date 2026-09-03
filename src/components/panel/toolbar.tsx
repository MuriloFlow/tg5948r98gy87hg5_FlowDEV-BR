"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
}

/**
 * Barra de busca e filtros que escreve na querystring — assim o estado da tela
 * é compartilhável por URL e sobrevive a refresh.
 */
export function DataToolbar({
  searchPlaceholder = "Buscar...",
  filters = [],
  children,
  right,
}: {
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [term, setTerm] = React.useState(params.get("q") ?? "");
  const [showFilters, setShowFilters] = React.useState(
    filters.some((f) => params.get(f.key))
  );

  const update = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router]
  );

  // debounce da busca
  React.useEffect(() => {
    const currentQ = params.get("q") ?? "";
    if (term === currentQ) return;
    const timer = setTimeout(() => update("q", term.trim() || null), 320);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const activeFilters = filters.filter((f) => params.get(f.key));
  const hasAny = activeFilters.length > 0 || Boolean(params.get("q"));

  function clearAll() {
    setTerm("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={searchPlaceholder}
            prefixIcon={pending ? <Loader2 className="animate-spin" /> : <Search />}
            className="h-9"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {filters.length > 0 && (
          <Button
            variant={showFilters || activeFilters.length > 0 ? "subtle" : "secondary"}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            icon={<SlidersHorizontal />}
          >
            Filtros
            {activeFilters.length > 0 && (
              <span className="ml-0.5 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                {activeFilters.length}
              </span>
            )}
          </Button>
        )}

        {hasAny && (
          <Button variant="ghost" size="sm" onClick={clearAll} icon={<X />}>
            Limpar
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>

      {showFilters && filters.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-ink-200 bg-white p-3 animate-slide-up">
          {filters.map((filter) => (
            <div key={filter.key} className="min-w-[170px] flex-1 sm:max-w-[220px]">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-400">
                {filter.label}
              </label>
              <NativeSelect
                value={params.get(filter.key) ?? ""}
                onChange={(event) => update(filter.key, event.target.value || null)}
                className="h-8 text-[12.5px]"
              >
                <option value="">{filter.allLabel ?? "Todos"}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total <= pageSize) {
    return (
      <p className="px-4 py-3 text-[12.5px] text-ink-400">
        {total} {total === 1 ? "registro" : "registros"}
      </p>
    );
  }

  function goTo(next: number) {
    const search = new URLSearchParams(params.toString());
    if (next <= 1) search.delete("page");
    else search.set("page", String(next));
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 bg-ink-50/40 px-4 py-2.5">
      <p className="text-[12.5px] text-ink-500 tabular">
        {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          Anterior
        </Button>
        <span className="px-2 text-[12.5px] text-ink-500 tabular">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="xs"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

/** Wrapper que aplica opacidade enquanto a navegação está pendente. */
export function ListSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("animate-fade-in", className)}>{children}</div>;
}
