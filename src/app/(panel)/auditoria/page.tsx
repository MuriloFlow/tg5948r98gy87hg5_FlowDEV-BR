import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { ScrollText, ShieldCheck, UserCog, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { AuditClient, type AuditRow, type FilterValue } from "./audit-client";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const PERIODS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface SearchParams {
  q?: string;
  acao?: string;
  entidade?: string;
  ator?: string;
  periodo?: string;
  page?: string;
}

function sinceDays(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function loadFilters() {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("audit_logs")
        .select("action, entity_type, actor_id, actor_label")
        .order("created_at", { ascending: false })
        .limit(1_000);

      const rows = (data ?? []) as {
        action: string;
        entity_type: string;
        actor_id: string | null;
        actor_label: string | null;
      }[];

      const actions = [...new Set(rows.map((row) => row.action))].sort();
      const entities = [...new Set(rows.map((row) => row.entity_type))].sort();

      const actors = new Map<string, string>();
      for (const row of rows) {
        if (row.actor_id) actors.set(row.actor_id, row.actor_label ?? "Usuário do painel");
      }

      return {
        actions: actions.map<FilterValue>((value) => ({ value, label: value })),
        entities: entities.map<FilterValue>((value) => ({ value, label: value })),
        actors: [...actors.entries()].map<FilterValue>(([value, label]) => ({ value, label })),
      };
    },
    { actions: [] as FilterValue[], entities: [] as FilterValue[], actors: [] as FilterValue[] }
  );
}

async function loadLogs(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.acao) query = query.eq("action", params.acao);
      if (params.entidade) query = query.eq("entity_type", params.entidade);
      if (params.ator) query = query.eq("actor_id", params.ator);
      if (params.periodo && PERIODS[params.periodo]) {
        query = query.gte("created_at", sinceDays(PERIODS[params.periodo]));
      }
      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `action.ilike.${like},entity_label.ilike.${like},actor_label.ilike.${like}`
        );
      }

      const { data, count } = await query;
      return { logs: (data ?? []) as AuditRow[], total: count ?? 0, page };
    },
    { logs: [] as AuditRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const [total, day, week, admins] = await Promise.all([
        db().from("audit_logs").select("id", { count: "exact", head: true }),
        db()
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceDays(1)),
        db()
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceDays(7)),
        db()
          .from("audit_logs")
          .select("actor_id")
          .eq("actor_type", "ADMIN")
          .gte("created_at", sinceDays(30))
          .limit(5_000),
      ]);

      const uniqueActors = new Set(
        ((admins.data ?? []) as { actor_id: string | null }[])
          .map((row) => row.actor_id)
          .filter(Boolean)
      );

      return {
        total: total.count ?? 0,
        day: day.count ?? 0,
        week: week.count ?? 0,
        actors: uniqueActors.size,
      };
    },
    { total: 0, day: 0, week: 0, actors: 0 }
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("audit:read");
  const params = await searchParams;

  const [{ logs, total, page }, filters, summary] = await Promise.all([
    loadLogs(params),
    loadFilters(),
    loadSummary(),
  ]);

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro imutável de tudo que a equipe, a API e as automações fizeram no sistema."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Registros totais"
            value={formatNumber(summary.total)}
            icon={<ScrollText />}
            tone="info"
          />
          <StatCard
            label="Últimas 24 horas"
            value={formatNumber(summary.day)}
            icon={<ShieldCheck />}
            tone="violet"
          />
          <StatCard
            label="Últimos 7 dias"
            value={formatNumber(summary.week)}
            icon={<UserCog />}
            tone="neutral"
          />
          <StatCard
            label="Usuários ativos (30d)"
            value={formatNumber(summary.actors)}
            hint="Administradores com ações registradas"
            icon={<Users />}
            tone="success"
          />
        </StatGrid>
      </div>

      <AuditClient
        rows={logs}
        actions={filters.actions}
        entities={filters.entities}
        actors={filters.actors}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
