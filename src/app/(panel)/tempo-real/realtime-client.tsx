"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  CreditCard,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Terminal,
  Webhook,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatCurrency, formatRelative, formatTime } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 5_000;
const FRESH_MS = 6_000;

export interface PulseCounters {
  payments_today: number;
  amount_today: number;
  events_last_hour: number;
  requests_per_minute: number;
  failed_webhooks: number;
}

export interface StreamItem {
  id: string;
  kind: "event" | "payment" | "request" | "activity";
  title: string;
  subtitle: string | null;
  badge: string | null;
  at: string;
  tone: Tone;
  href: string | null;
}

const KIND_META: Record<
  StreamItem["kind"],
  { label: string; icon: React.ElementType; className: string }
> = {
  event: { label: "Evento", icon: Zap, className: "bg-sky-50 text-sky-600" },
  payment: { label: "Pagamento", icon: CreditCard, className: "bg-emerald-50 text-emerald-600" },
  request: { label: "API", icon: Terminal, className: "bg-brand-50 text-brand-600" },
  activity: { label: "Atividade", icon: Activity, className: "bg-violet-50 text-violet-600" },
};

export function RealtimeClient({
  counters,
  items,
}: {
  counters: PulseCounters;
  items: StreamItem[];
}) {
  const router = useRouter();
  const [live, setLive] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [freshIds, setFreshIds] = React.useState<string[]>([]);
  const [lastUpdate, setLastUpdate] = React.useState<string | null>(null);

  const seen = React.useRef<Set<string> | null>(null);
  const lastSignature = React.useRef<string>("");

  // primeira renderização não pisca: tudo que já está na tela é considerado visto
  React.useEffect(() => {
    if (seen.current) {
      const incoming = items.map((item) => item.id).filter((id) => !seen.current!.has(id));
      for (const id of items.map((item) => item.id)) seen.current.add(id);
      if (incoming.length > 0) {
        setFreshIds(incoming);
        setLastUpdate(new Date().toISOString());
      }
    } else {
      seen.current = new Set(items.map((item) => item.id));
    }
  }, [items]);

  React.useEffect(() => {
    if (freshIds.length === 0) return;
    const timer = setTimeout(() => setFreshIds([]), FRESH_MS);
    return () => clearTimeout(timer);
  }, [freshIds]);

  // mesmo padrão do shell: consulta um pulso barato e só recarrega quando muda
  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;

    async function tick() {
      try {
        const response = await fetch("/api/admin/pulse", { cache: "no-store" });
        if (!response.ok) return;
        const { signature } = (await response.json()) as { signature?: string };
        if (cancelled || !signature) return;
        if (lastSignature.current && signature !== lastSignature.current) {
          router.refresh();
        }
        lastSignature.current = signature;
      } catch {
        /* offline: tentamos de novo no próximo ciclo */
      }
    }

    void tick();
    const interval = setInterval(tick, POLL_INTERVAL);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [live, router]);

  function manualRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 700);
  }

  const fresh = new Set(freshIds);

  return (
    <div className="space-y-5">
      <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pagamentos aprovados hoje"
          value={String(counters.payments_today)}
          hint={formatCurrency(counters.amount_today)}
          icon={<CreditCard />}
          tone="success"
        />
        <Metric
          label="Eventos na última hora"
          value={String(counters.events_last_hour)}
          hint="Disparados para os webhooks"
          icon={<Zap />}
          tone="info"
        />
        <Metric
          label="Requisições por minuto"
          value={counters.requests_per_minute.toLocaleString("pt-BR")}
          hint="Média dos últimos 5 minutos"
          icon={<Terminal />}
          tone="violet"
        />
        <Metric
          label="Webhooks com falha"
          value={String(counters.failed_webhooks)}
          hint={counters.failed_webhooks > 0 ? "Precisam de reenvio" : "Nenhuma entrega pendente"}
          icon={<Webhook />}
          tone={counters.failed_webhooks > 0 ? "danger" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Fluxo cronológico</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              {live
                ? `Atualizando automaticamente a cada ${POLL_INTERVAL / 1000} segundos`
                : "Atualização automática pausada"}
              {lastUpdate ? ` · última novidade às ${formatTime(lastUpdate)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={live ? "subtle" : "secondary"}
              size="sm"
              onClick={() => setLive((value) => !value)}
              icon={live ? <Pause /> : <Play />}
            >
              {live ? "Pausar" : "Retomar"}
            </Button>
            <Button variant="secondary" size="sm" onClick={manualRefresh} icon={<RefreshCw className={cn(refreshing && "animate-spin")} />}>
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={<Radio />}
                title="Nenhuma atividade ainda"
                description="Assim que sua aplicação começar a chamar a API ou receber pagamentos, tudo aparecerá aqui em tempo real."
                className="border-0 bg-transparent py-0"
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {items.map((item) => {
                const meta = KIND_META[item.kind];
                const Icon = meta.icon;
                const isFresh = fresh.has(item.id);

                const row = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-5 py-3 transition-colors duration-500",
                      isFresh && "bg-brand-50/60 animate-slide-up"
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-ink-900">
                          {item.title}
                        </p>
                        {isFresh && (
                          <Badge tone="violet" size="sm" className="animate-fade-in">
                            novo
                          </Badge>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="truncate text-[11.5px] text-ink-500">{item.subtitle}</p>
                      )}
                    </div>

                    <div className="shrink-0 space-y-1 text-right">
                      {item.badge && (
                        <Badge tone={item.tone} size="sm" dot>
                          <span className="max-w-[140px] truncate font-mono text-[10.5px]">
                            {item.badge}
                          </span>
                        </Badge>
                      )}
                      <p className="text-[11px] text-ink-400">{formatRelative(item.at)}</p>
                    </div>
                  </div>
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} className="block hover:bg-ink-50/70">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const METRIC_TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-500",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600",
  info: "bg-sky-50 text-sky-600",
  violet: "bg-brand-50 text-brand-600",
};

function Metric({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: Tone;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
            METRIC_TONES[tone]
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular text-ink-900">
        {value}
      </p>
      <p className="mt-2.5 truncate text-[11.5px] text-ink-400">{hint}</p>
    </div>
  );
}
