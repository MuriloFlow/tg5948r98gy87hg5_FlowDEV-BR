"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  Blocks,
  CornerDownLeft,
  Loader2,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { ALL_NAV_ITEMS } from "@/lib/navigation";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SearchHit {
  type: "customer" | "project" | "invoice";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  amount?: number | null;
}

const TYPE_META = {
  customer: { icon: Users, label: "Clientes" },
  project: { icon: Blocks, label: "Projetos" },
  invoice: { icon: Receipt, label: "Cobranças" },
} as const;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  const term = query.trim();
  const searching = term.length >= 2;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setHits([]);
    }
    onOpenChange(next);
  }

  React.useEffect(() => {
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (response.ok) setHits((await response.json()).results ?? []);
      } catch {
        /* busca cancelada */
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  const grouped = React.useMemo(() => {
    const map: Record<string, SearchHit[]> = {};
    if (!searching) return map;
    for (const hit of hits) (map[hit.type] ??= []).push(hit);
    return map;
  }, [hits, searching]);

  const busy = searching && loading;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-[3px] data-[state=open]:animate-[fade-in_0.15s_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-[600px] -translate-x-1/2",
            "overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-pop)]",
            "data-[state=open]:animate-[scale-in_0.16s_cubic-bezier(0.16,1,0.3,1)]"
          )}
        >
          <Dialog.Title className="sr-only">Busca global</Dialog.Title>
          <Dialog.Description className="sr-only">
            Busque clientes, projetos, cobranças ou navegue pelo painel
          </Dialog.Description>

          <Command shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-ink-200 px-4">
              {busy ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand-500" />
              ) : (
                <Search className="size-4 shrink-0 text-ink-400" />
              )}
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar cliente, projeto, cobrança ou página..."
                className="h-14 flex-1 bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-400"
              />
              <kbd className="hidden rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 sm:block">
                ESC
              </kbd>
            </div>

            <Command.List className="scrollbar-thin max-h-[min(420px,60vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-10 text-center text-[13px] text-ink-400">
                {!searching
                  ? "Digite ao menos 2 caracteres para buscar."
                  : busy
                    ? "Buscando..."
                    : "Nenhum resultado encontrado."}
              </Command.Empty>

              {Object.entries(grouped).map(([type, items]) => {
                const meta = TYPE_META[type as keyof typeof TYPE_META];
                const Icon = meta.icon;
                return (
                  <Command.Group
                    key={type}
                    heading={meta.label}
                    className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-ink-400"
                  >
                    {items.map((hit) => (
                      <Command.Item
                        key={`${hit.type}-${hit.id}`}
                        value={`${hit.type}-${hit.id}`}
                        onSelect={() => go(hit.href)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-[13px] data-[selected=true]:bg-ink-100"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-900">
                            {hit.title}
                          </span>
                          {hit.subtitle && (
                            <span className="block truncate text-[12px] text-ink-500">
                              {hit.subtitle}
                            </span>
                          )}
                        </span>
                        {hit.amount != null && (
                          <span className="shrink-0 text-[12.5px] font-medium tabular text-ink-700">
                            {formatCurrency(hit.amount)}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              <Command.Group
                heading="Ir para"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-ink-400"
              >
                {ALL_NAV_ITEMS.filter((item) => {
                  const term = query.trim().toLowerCase();
                  if (!term) return true;
                  return (
                    item.label.toLowerCase().includes(term) ||
                    item.description?.toLowerCase().includes(term)
                  );
                })
                  .slice(0, query.trim() ? 5 : 8)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.href}
                        value={`nav-${item.href}`}
                        onSelect={() => go(item.href)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-ink-100"
                      >
                        <Icon className="size-4 shrink-0 text-ink-400" />
                        <span className="flex-1 truncate text-ink-800">{item.label}</span>
                        <span className="truncate text-[11.5px] text-ink-400">
                          {item.description}
                        </span>
                      </Command.Item>
                    );
                  })}
              </Command.Group>
            </Command.List>

            <div className="flex items-center justify-between border-t border-ink-200 bg-ink-50/60 px-4 py-2.5 text-[11px] text-ink-400">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-ink-200 bg-white px-1 py-0.5 font-mono">↑</kbd>
                  <kbd className="rounded border border-ink-200 bg-white px-1 py-0.5 font-mono">↓</kbd>
                  navegar
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="size-3" /> abrir
                </span>
              </span>
              <span className="font-medium">FlowDesk</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
