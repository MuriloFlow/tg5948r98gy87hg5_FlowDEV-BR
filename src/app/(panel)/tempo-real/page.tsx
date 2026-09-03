import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { LiveDot } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { eventLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";
import { RealtimeClient, type PulseCounters, type StreamItem } from "./realtime-client";

export const metadata: Metadata = { title: "Tempo real" };
export const dynamic = "force-dynamic";

const EMPTY_COUNTERS: PulseCounters = {
  payments_today: 0,
  amount_today: 0,
  events_last_hour: 0,
  requests_per_minute: 0,
  failed_webhooks: 0,
};

async function loadCounters(): Promise<PulseCounters> {
  return safeQuery(async () => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const hourAgo = new Date(now - 3_600_000).toISOString();
    const fiveMinAgo = new Date(now - 300_000).toISOString();

    const [payments, events, requests, webhooks] = await Promise.all([
      db()
        .from("payments")
        .select("amount, status")
        .gte("created_at", startOfDay.toISOString()),
      db()
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", hourAgo),
      db()
        .from("api_requests")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fiveMinAgo),
      db()
        .from("webhook_deliveries")
        .select("id", { count: "exact", head: true })
        .in("status", ["FAILED", "RETRYING"]),
    ]);

    const rows = (payments.data ?? []) as { amount: number | string; status: string }[];
    const approved = rows.filter((row) => row.status === "APPROVED");

    return {
      payments_today: approved.length,
      amount_today: approved.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      events_last_hour: events.count ?? 0,
      requests_per_minute: Math.round(((requests.count ?? 0) / 5) * 10) / 10,
      failed_webhooks: webhooks.count ?? 0,
    };
  }, EMPTY_COUNTERS);
}

async function loadStream(): Promise<StreamItem[]> {
  return safeQuery(async () => {
    const [events, payments, requests, activity, projects] = await Promise.all([
      db()
        .from("events")
        .select("id, type, project_id, resource_type, delivered, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db()
        .from("payments")
        .select("id, method, status, amount, project_id, invoice_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db()
        .from("api_requests")
        .select("id, method, path, status_code, duration_ms, project_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db()
        .from("activity_log")
        .select("id, title, description, kind, actor_label, project_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db().from("projects").select("id, name").neq("status", "ARCHIVED").limit(500),
    ]);

    const projectName = new Map<string, string>(
      ((projects.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
    );

    const items: StreamItem[] = [];

    for (const row of (events.data ?? []) as {
      id: string;
      type: string;
      project_id: string | null;
      resource_type: string | null;
      delivered: boolean;
      created_at: string;
    }[]) {
      items.push({
        id: `event:${row.id}`,
        kind: "event",
        title: eventLabel(row.type),
        subtitle: [
          row.project_id ? projectName.get(row.project_id) : null,
          row.resource_type,
          row.delivered ? "entregue" : "na fila",
        ]
          .filter(Boolean)
          .join(" · "),
        badge: row.type,
        at: row.created_at,
        tone: row.delivered ? "info" : "neutral",
        href: "/eventos",
      });
    }

    for (const row of (payments.data ?? []) as {
      id: string;
      method: string;
      status: string;
      amount: number | string;
      project_id: string | null;
      invoice_id: string | null;
      created_at: string;
    }[]) {
      const failed = ["REJECTED", "CANCELLED", "CHARGED_BACK"].includes(row.status);
      items.push({
        id: `payment:${row.id}`,
        kind: "payment",
        title: `Pagamento ${formatCurrency(Number(row.amount ?? 0))}`,
        subtitle: [row.project_id ? projectName.get(row.project_id) : null, row.method]
          .filter(Boolean)
          .join(" · "),
        badge: row.status,
        at: row.created_at,
        tone: row.status === "APPROVED" ? "success" : failed ? "danger" : "warning",
        href: row.invoice_id ? `/cobrancas/${row.invoice_id}` : "/pagamentos",
      });
    }

    for (const row of (requests.data ?? []) as {
      id: string;
      method: string;
      path: string;
      status_code: number;
      duration_ms: number;
      project_id: string | null;
      created_at: string;
    }[]) {
      items.push({
        id: `request:${row.id}`,
        kind: "request",
        title: `${row.method} ${row.path}`,
        subtitle: [
          row.project_id ? projectName.get(row.project_id) : null,
          `${row.duration_ms} ms`,
        ]
          .filter(Boolean)
          .join(" · "),
        badge: String(row.status_code),
        at: row.created_at,
        tone: row.status_code >= 500 ? "danger" : row.status_code >= 400 ? "warning" : "success",
        href: "/logs-api",
      });
    }

    for (const row of (activity.data ?? []) as {
      id: string;
      title: string;
      description: string | null;
      kind: string;
      actor_label: string | null;
      project_id: string | null;
      created_at: string;
    }[]) {
      items.push({
        id: `activity:${row.id}`,
        kind: "activity",
        title: row.title,
        subtitle: [row.description, row.actor_label].filter(Boolean).join(" · ") || null,
        badge: row.kind,
        at: row.created_at,
        tone: "violet",
        href: null,
      });
    }

    return items
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 60);
  }, []);
}

export default async function RealtimePage() {
  await requireUser();
  const [counters, stream] = await Promise.all([loadCounters(), loadStream()]);

  return (
    <>
      <PageHeader
        title="Tempo real"
        description="Fluxo ao vivo de eventos, pagamentos, chamadas de API e atividades do sistema."
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <LiveDot />
            Ao vivo
          </span>
        }
      />

      <RealtimeClient counters={counters} items={stream} />
    </>
  );
}
