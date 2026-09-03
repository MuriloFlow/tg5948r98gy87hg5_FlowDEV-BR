import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Activity, CheckCircle2, Clock, Webhook } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import {
  EventsClient,
  type DeliveryRow,
  type EventRow,
  type ProjectOption,
} from "./events-client";

export const metadata: Metadata = { title: "Eventos" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  tipo?: string;
  projeto?: string;
  entrega?: string;
  page?: string;
}

async function loadProjects(): Promise<ProjectOption[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("projects")
      .select("id, name, code")
      .neq("status", "ARCHIVED")
      .order("name", { ascending: true })
      .limit(300);
    return (data ?? []) as ProjectOption[];
  }, []);
}

async function loadEvents(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("events")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.tipo) query = query.eq("type", params.tipo);
      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(`type.ilike.${like},resource_type.ilike.${like}`);
      }
      if (params.entrega === "sim") query = query.eq("delivered", true);
      if (params.entrega === "nao") query = query.eq("delivered", false);

      const { data, count } = await query;
      const events = (data ?? []) as EventRow[];

      const ids = events.map((event) => event.id);
      let deliveries: DeliveryRow[] = [];

      if (ids.length > 0) {
        const [{ data: deliveryRows }, { data: projectRows }] = await Promise.all([
          db()
            .from("webhook_deliveries")
            .select(
              "id, event_id, event_type, attempt, status, request_url, response_status, error_message, duration_ms, delivered_at, next_retry_at, created_at"
            )
            .in("event_id", ids)
            .order("created_at", { ascending: false }),
          db()
            .from("projects")
            .select("id, name, code")
            .in(
              "id",
              events.map((event) => event.project_id).filter((id): id is string => Boolean(id))
            ),
        ]);

        deliveries = (deliveryRows ?? []) as DeliveryRow[];

        const names = new Map<string, string>(
          ((projectRows ?? []) as ProjectOption[]).map((project) => [project.id, project.name])
        );
        for (const event of events) {
          event.project_name = event.project_id ? (names.get(event.project_id) ?? null) : null;
        }
      }

      return { events, deliveries, total: count ?? 0, page };
    },
    { events: [] as EventRow[], deliveries: [] as DeliveryRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const [total, pending, last24h, failed] = await Promise.all([
        db().from("events").select("id", { count: "exact", head: true }),
        db()
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("delivered", false),
        db()
          .from("events")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayAgo),
        db()
          .from("webhook_deliveries")
          .select("id", { count: "exact", head: true })
          .in("status", ["FAILED", "RETRYING"]),
      ]);

      return {
        total: total.count ?? 0,
        pending: pending.count ?? 0,
        last24h: last24h.count ?? 0,
        failed: failed.count ?? 0,
      };
    },
    { total: 0, pending: 0, last24h: 0, failed: 0 }
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const params = await searchParams;

  const [{ events, deliveries, total, page }, projects, summary] = await Promise.all([
    loadEvents(params),
    loadProjects(),
    loadSummary(),
  ]);

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Tudo que o FlowDesk emite para as aplicações integradas — com o payload exato entregue nos webhooks."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Eventos registrados"
            value={formatNumber(summary.total)}
            icon={<Activity />}
            tone="info"
          />
          <StatCard
            label="Últimas 24 horas"
            value={formatNumber(summary.last24h)}
            icon={<Clock />}
            tone="violet"
          />
          <StatCard
            label="Aguardando entrega"
            value={formatNumber(summary.pending)}
            hint="Eventos ainda não enviados aos endpoints"
            icon={<CheckCircle2 />}
            tone={summary.pending > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Entregas com falha"
            value={formatNumber(summary.failed)}
            hint={summary.failed > 0 ? "Requerem reenvio" : "Nenhuma falha ativa"}
            icon={<Webhook />}
            tone={summary.failed > 0 ? "danger" : "neutral"}
            href="/webhooks"
          />
        </StatGrid>
      </div>

      <EventsClient
        rows={events}
        deliveries={deliveries}
        projects={projects}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
