"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  BellOff,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Info,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { DataToolbar } from "@/components/panel/toolbar";
import {
  deleteNotificationAction,
  markAllReadAction,
  markNotificationReadAction,
} from "@/server/settings";
import type { ActionResult } from "@/server/action-utils";
import { formatRelative, formatTime } from "@/lib/format";
import type { NotificationSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface NotificationRow {
  id: string;
  user_id: string | null;
  severity: NotificationSeverity;
  category: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface DayGroup {
  day: string;
  items: NotificationRow[];
}

const SEVERITY = {
  INFO: { icon: Info, label: "Informação", className: "bg-sky-50 text-sky-600" },
  SUCCESS: { icon: CircleCheck, label: "Sucesso", className: "bg-emerald-50 text-emerald-600" },
  WARNING: { icon: AlertTriangle, label: "Aviso", className: "bg-amber-50 text-amber-600" },
  CRITICAL: { icon: CircleAlert, label: "Crítico", className: "bg-rose-50 text-rose-600" },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  general: "Geral",
  billing: "Cobrança",
  security: "Segurança",
  integration: "Integração",
  system: "Sistema",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** "Hoje", "Ontem" ou a data completa. */
function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(year, month - 1, date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(target);
}

export function NotificationsClient({
  groups,
  categories,
  unread,
}: {
  groups: DayGroup[];
  categories: string[];
  unread: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, action: () => Promise<ActionResult>) {
    setBusy(key);
    const result = await action();
    setBusy(null);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar no título ou no conteúdo..."
        filters={[
          {
            key: "severidade",
            label: "Severidade",
            options: [
              { value: "CRITICAL", label: "Crítico" },
              { value: "WARNING", label: "Aviso" },
              { value: "SUCCESS", label: "Sucesso" },
              { value: "INFO", label: "Informação" },
            ],
          },
          {
            key: "categoria",
            label: "Categoria",
            options: categories.map((category) => ({
              value: category,
              label: categoryLabel(category),
            })),
          },
          {
            key: "leitura",
            label: "Leitura",
            options: [
              { value: "nao", label: "Não lidas" },
              { value: "sim", label: "Lidas" },
            ],
          },
        ]}
        right={
          unread > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCheck />}
              loading={busy === "all"}
              onClick={() => void run("all", markAllReadAction)}
            >
              Marcar todas como lidas
            </Button>
          )
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={<BellOff />}
          title="Nenhuma notificação"
          description="Quando um projeto for bloqueado, um pagamento cair ou um webhook falhar, você será avisado aqui."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.day} className="space-y-2.5">
              <div className="flex items-center gap-3">
                <h2 className="text-[13px] font-semibold capitalize text-ink-800">
                  {dayLabel(group.day)}
                </h2>
                <span className="h-px flex-1 bg-ink-200" aria-hidden />
                <span className="text-[11.5px] text-ink-400">
                  {group.items.length} {group.items.length === 1 ? "item" : "itens"}
                </span>
              </div>

              <ul className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card)]">
                {group.items.map((item, index) => {
                  const meta = SEVERITY[item.severity] ?? SEVERITY.INFO;
                  const Icon = meta.icon;
                  const isUnread = !item.read_at;

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3.5 transition-colors",
                        index > 0 && "border-t border-ink-200/70",
                        isUnread && "bg-brand-50/35"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          meta.className
                        )}
                      >
                        <Icon className="size-4" />
                      </span>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13.5px] font-medium leading-snug text-ink-900">
                            {item.title}
                          </p>
                          <Badge tone="neutral" size="sm">
                            {categoryLabel(item.category)}
                          </Badge>
                          {isUnread && (
                            <span className="size-1.5 rounded-full bg-brand-500" aria-label="Não lida" />
                          )}
                        </div>

                        {item.body && (
                          <p className="text-[12.5px] leading-relaxed text-ink-500">{item.body}</p>
                        )}

                        <p className="text-[11px] text-ink-400">
                          {formatTime(item.created_at)} · {formatRelative(item.created_at)}
                        </p>

                        {item.action_url && (
                          <Link
                            href={item.action_url}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:underline"
                          >
                            Abrir registro
                            <ArrowUpRight className="size-3" />
                          </Link>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="iconXs"
                          aria-label={isUnread ? "Marcar como lida" : "Marcar como não lida"}
                          title={isUnread ? "Marcar como lida" : "Marcar como não lida"}
                          loading={busy === `read:${item.id}`}
                          onClick={() =>
                            void run(`read:${item.id}`, () =>
                              markNotificationReadAction(item.id, isUnread)
                            )
                          }
                        >
                          {isUnread ? <Check /> : <Undo2 />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconXs"
                          aria-label="Remover notificação"
                          title="Remover notificação"
                          className="text-ink-400 hover:text-rose-600"
                          loading={busy === `delete:${item.id}`}
                          onClick={() =>
                            void run(`delete:${item.id}`, () => deleteNotificationAction(item.id))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
