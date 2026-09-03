import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Send, Webhook } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { requireUser, can } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber, formatPercent } from "@/lib/format";
import type { WebhookEndpoint } from "@/lib/types";
import { WebhooksClient, type DeliveryRow, type EndpointRow } from "./webhooks-client";
import type { WebhookProjectOption } from "./webhook-form";

export const metadata: Metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

const DELIVERY_LIMIT = 60;

interface SearchParams {
  q?: string;
  projeto?: string;
  status?: string;
}

async function loadEndpoints(params: SearchParams) {
  return safeQuery(
    async () => {
      let query = db()
        .from("webhook_endpoints")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.status) query = query.eq("status", params.status);
      if (params.q) query = query.ilike("url", `%${params.q}%`);

      const { data } = await query;
      const endpoints = (data ?? []) as WebhookEndpoint[];
      if (endpoints.length === 0) return [] as EndpointRow[];

      const projectIds = [...new Set(endpoints.map((e) => e.project_id))];
      const { data: projects } = await db()
        .from("projects")
        .select("id, name")
        .in("id", projectIds);

      const nameById = new Map(
        ((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
      );

      return endpoints.map((endpoint) => ({
        ...endpoint,
        total_deliveries: Number(endpoint.total_deliveries ?? 0),
        project_name: nameById.get(endpoint.project_id) ?? "Projeto removido",
      })) satisfies EndpointRow[];
    },
    [] as EndpointRow[]
  );
}

async function loadDeliveries(endpointIds: string[]) {
  return safeQuery(
    async () => {
      if (endpointIds.length === 0) return [] as DeliveryRow[];

      const { data } = await db()
        .from("webhook_deliveries")
        .select("*")
        .in("endpoint_id", endpointIds)
        .order("created_at", { ascending: false })
        .limit(DELIVERY_LIMIT);

      const { data: endpoints } = await db()
        .from("webhook_endpoints")
        .select("id, url")
        .in("id", endpointIds);

      const urlById = new Map(
        ((endpoints ?? []) as { id: string; url: string }[]).map((e) => [e.id, e.url])
      );

      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        endpoint_id: String(row.endpoint_id),
        endpoint_url: urlById.get(String(row.endpoint_id)) ?? String(row.request_url ?? ""),
        event_id: String(row.event_id),
        event_type: String(row.event_type),
        attempt: Number(row.attempt ?? 1),
        status: row.status as DeliveryRow["status"],
        request_url: String(row.request_url ?? ""),
        request_body: (row.request_body as string | null) ?? null,
        request_headers: (row.request_headers as Record<string, unknown>) ?? {},
        response_status: row.response_status != null ? Number(row.response_status) : null,
        response_body: (row.response_body as string | null) ?? null,
        error_message: (row.error_message as string | null) ?? null,
        duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
        created_at: String(row.created_at),
        delivered_at: (row.delivered_at as string | null) ?? null,
      })) satisfies DeliveryRow[];
    },
    [] as DeliveryRow[]
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

      const [{ data: endpoints }, { data: recent }] = await Promise.all([
        db().from("webhook_endpoints").select("status, consecutive_failures"),
        db().from("webhook_deliveries").select("status").gte("created_at", since),
      ]);

      const list = (endpoints ?? []) as { status: string; consecutive_failures: number }[];
      const attempts = (recent ?? []) as { status: string }[];
      const success = attempts.filter((d) => d.status === "SUCCESS").length;

      return {
        active: list.filter((e) => e.status === "ACTIVE").length,
        failing: list.filter((e) => Number(e.consecutive_failures ?? 0) > 0).length,
        deliveries24h: attempts.length,
        successRate: attempts.length > 0 ? (success / attempts.length) * 100 : null,
      };
    },
    { active: 0, failing: 0, deliveries24h: 0, successRate: null as number | null }
  );
}

async function loadProjects(): Promise<WebhookProjectOption[]> {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("projects")
        .select("id, name")
        .neq("status", "ARCHIVED")
        .order("name")
        .limit(500);
      return (data ?? []) as WebhookProjectOption[];
    },
    [] as WebhookProjectOption[]
  );
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [endpoints, summary, projects] = await Promise.all([
    loadEndpoints(params),
    loadSummary(),
    loadProjects(),
  ]);

  const deliveries = await loadDeliveries(endpoints.map((e) => e.id));

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Endpoints que recebem os eventos do FlowDesk assinados com HMAC-SHA256, com histórico completo de entregas e reenvio manual."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Endpoints ativos"
            value={String(summary.active)}
            hint="Recebendo eventos agora"
            icon={<Webhook />}
            tone="info"
          />
          <StatCard
            label="Entregas (24h)"
            value={formatNumber(summary.deliveries24h)}
            hint="Todas as tentativas registradas"
            icon={<Send />}
            tone="violet"
          />
          <StatCard
            label="Taxa de sucesso"
            value={summary.successRate == null ? "—" : formatPercent(summary.successRate)}
            hint="Respostas 2xx nas últimas 24h"
            icon={<CheckCircle2 />}
            tone={
              summary.successRate == null
                ? "neutral"
                : summary.successRate >= 95
                  ? "success"
                  : "warning"
            }
          />
          <StatCard
            label="Endpoints com falha"
            value={String(summary.failing)}
            hint={
              summary.failing > 0
                ? "Com falhas consecutivas acumuladas"
                : "Nenhuma falha pendente"
            }
            icon={<AlertTriangle />}
            tone={summary.failing > 0 ? "danger" : "success"}
          />
        </StatGrid>
      </div>

      <WebhooksClient
        endpoints={endpoints}
        deliveries={deliveries}
        projects={projects}
        canManage={can(user.role, "webhooks:manage")}
        defaultProjectId={params.projeto ?? null}
      />
    </>
  );
}
