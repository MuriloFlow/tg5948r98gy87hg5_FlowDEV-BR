"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY = {
  INFO: { icon: Info, className: "bg-sky-50 text-sky-600" },
  SUCCESS: { icon: CircleCheck, className: "bg-emerald-50 text-emerald-600" },
  WARNING: { icon: AlertTriangle, className: "bg-amber-50 text-amber-600" },
  CRITICAL: { icon: CircleAlert, className: "bg-rose-50 text-rose-600" },
} as const;

export function NotificationsPopover({ unread }: { unread: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [marking, setMarking] = React.useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setLoading(true);
    fetch("/api/admin/notifications?limit=12")
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((data) => setItems(data.notifications ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  async function markAllRead() {
    setMarking(true);
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    });
    setItems((current) =>
      current.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
    setMarking(false);
    router.refresh();
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
          aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ""}`}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold leading-4 text-white ring-2 ring-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-200 bg-white",
            "shadow-[var(--shadow-pop)] data-[state=open]:animate-[scale-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
          )}
        >
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <p className="text-[13.5px] font-semibold text-ink-900">Notificações</p>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={markAllRead}
                loading={marking}
                icon={<CheckCheck />}
              >
                Marcar todas
              </Button>
            )}
          </div>

          <div className="scrollbar-thin max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-400">
                <Loader2 className="size-4 animate-spin" />
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
                <BellOff className="size-6 text-ink-300" />
                <p className="text-[13px] text-ink-500">Nenhuma notificação por aqui.</p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-200/70">
                {items.map((item) => {
                  const meta = SEVERITY[item.severity] ?? SEVERITY.INFO;
                  const Icon = meta.icon;
                  const body = (
                    <div
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors",
                        !item.read_at && "bg-brand-50/40"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                          meta.className
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium leading-snug text-ink-900">
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-500">
                            {item.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-ink-400">
                          {formatRelative(item.created_at)}
                        </p>
                      </div>
                      {!item.read_at && (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {item.action_url ? (
                        <Link
                          href={item.action_url}
                          onClick={() => setOpen(false)}
                          className="block hover:bg-ink-50"
                        >
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-ink-200 bg-ink-50/60 px-4 py-2.5">
            <Link
              href="/notificacoes"
              onClick={() => setOpen(false)}
              className="text-[12.5px] font-medium text-brand-600 hover:underline"
            >
              Ver todas as notificações
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
