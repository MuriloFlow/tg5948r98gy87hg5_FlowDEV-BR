import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { AlertOctagon, Gauge, Terminal, Timer } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  ApiLogsClient,
  type ApiRequestRow,
  type HourBucket,
  type ProjectOption,
} from "./api-logs-client";

export const metadata: Metadata = { title: "Logs da API" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const PERIODS: Record<string, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

interface SearchParams {
  q?: string;
  metodo?: string;
  classe?: string;
  projeto?: string;
  periodo?: string;
  page?: string;
}

function since(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
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

async function loadSummary() {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("api_requests")
        .select("status_code, duration_ms, created_at")
        .gte("created_at", since(24))
        .order("created_at", { ascending: false })
        .limit(10_000);

      const rows = (data ?? []) as {
        status_code: number;
        duration_ms: number;
        created_at: string;
      }[];

      const total = rows.length;
      const errors = rows.filter((row) => row.status_code >= 400).length;
      const durations = rows.map((row) => Number(row.duration_ms ?? 0)).sort((a, b) => a - b);

      const average = total > 0 ? durations.reduce((sum, ms) => sum + ms, 0) / total : 0;
      const p95 = total > 0 ? durations[Math.min(total - 1, Math.floor(total * 0.95))] : 0;

      // 24 baldes de 1 hora, do mais antigo para o mais recente
      const now = Date.now();
      const buckets: HourBucket[] = Array.from({ length: 24 }, (_, index) => {
        const start = new Date(now - (23 - index) * 3_600_000);
        start.setMinutes(0, 0, 0);
        return {
          label: `${String(start.getHours()).padStart(2, "0")}h`,
          total: 0,
          errors: 0,
        };
      });

      for (const row of rows) {
        const diffHours = Math.floor((now - new Date(row.created_at).getTime()) / 3_600_000);
        const index = 23 - diffHours;
        if (index >= 0 && index < 24) {
          buckets[index].total += 1;
          if (row.status_code >= 400) buckets[index].errors += 1;
        }
      }

      return {
        total,
        errorRate: total > 0 ? (errors / total) * 100 : 0,
        average,
        p95,
        buckets,
      };
    },
    { total: 0, errorRate: 0, average: 0, p95: 0, buckets: [] as HourBucket[] }
  );
}

async function loadRequests(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;
      const hours = PERIODS[params.periodo ?? "24h"] ?? 24;

      let query = db()
        .from("api_requests")
        .select("*", { count: "exact" })
        .gte("created_at", since(hours))
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.metodo) query = query.eq("method", params.metodo);
      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.q) query = query.ilike("path", `%${params.q}%`);

      if (params.classe === "2xx") query = query.gte("status_code", 200).lt("status_code", 300);
      if (params.classe === "4xx") query = query.gte("status_code", 400).lt("status_code", 500);
      if (params.classe === "5xx") query = query.gte("status_code", 500);

      const { data, count } = await query;
      const requests = (data ?? []) as ApiRequestRow[];

      const projectIds = [
        ...new Set(
          requests.map((row) => row.project_id).filter((id): id is string => Boolean(id))
        ),
      ];

      if (projectIds.length > 0) {
        const { data: projectRows } = await db()
          .from("projects")
          .select("id, name, code")
          .in("id", projectIds);

        const names = new Map<string, string>(
          ((projectRows ?? []) as ProjectOption[]).map((project) => [project.id, project.name])
        );
        for (const row of requests) {
          row.project_name = row.project_id ? (names.get(row.project_id) ?? null) : null;
        }
      }

      return { requests, total: count ?? 0, page };
    },
    { requests: [] as ApiRequestRow[], total: 0, page: 1 }
  );
}

export default async function ApiLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const params = await searchParams;

  const [{ requests, total, page }, summary, projects] = await Promise.all([
    loadRequests(params),
    loadSummary(),
    loadProjects(),
  ]);

  return (
    <>
      <PageHeader
        title="Logs da API"
        description="Cada requisição recebida pela API pública do FlowDesk, com latência, status e corpo enviado."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Requisições (24h)"
            value={formatNumber(summary.total)}
            icon={<Terminal />}
            tone="info"
          />
          <StatCard
            label="Taxa de erro"
            value={formatPercent(summary.errorRate)}
            hint="Respostas com status 4xx ou 5xx"
            icon={<AlertOctagon />}
            tone={summary.errorRate > 5 ? "danger" : summary.errorRate > 1 ? "warning" : "success"}
          />
          <StatCard
            label="Latência média"
            value={`${Math.round(summary.average)} ms`}
            icon={<Timer />}
            tone="violet"
          />
          <StatCard
            label="Latência p95"
            value={`${Math.round(summary.p95)} ms`}
            hint="95% das chamadas respondem abaixo disso"
            icon={<Gauge />}
            tone={summary.p95 > 1000 ? "warning" : "neutral"}
          />
        </StatGrid>
      </div>

      <ApiLogsClient
        rows={requests}
        buckets={summary.buckets}
        projects={projects}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
