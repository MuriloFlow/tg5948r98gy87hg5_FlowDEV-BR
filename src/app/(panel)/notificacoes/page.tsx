import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { AlertTriangle, Bell, BellRing, CircleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import {
  NotificationsClient,
  type NotificationRow,
  type DayGroup,
} from "./notifications-client";

export const metadata: Metadata = { title: "Notificações" };
export const dynamic = "force-dynamic";

const LIMIT = 120;

interface SearchParams {
  q?: string;
  severidade?: string;
  categoria?: string;
  leitura?: string;
}

/** Chave de agrupamento no fuso local do servidor (pt-BR). */
function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

async function loadNotifications(params: SearchParams) {
  return safeQuery(
    async () => {
      let query = db()
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMIT);

      if (params.severidade) query = query.eq("severity", params.severidade);
      if (params.categoria) query = query.eq("category", params.categoria);
      if (params.leitura === "nao") query = query.is("read_at", null);
      if (params.leitura === "sim") query = query.not("read_at", "is", null);
      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(`title.ilike.${like},body.ilike.${like}`);
      }

      const { data } = await query;
      const rows = (data ?? []) as NotificationRow[];

      const groups = new Map<string, NotificationRow[]>();
      for (const row of rows) {
        const key = dayKey(row.created_at);
        const bucket = groups.get(key);
        if (bucket) bucket.push(row);
        else groups.set(key, [row]);
      }

      return [...groups.entries()].map<DayGroup>(([day, items]) => ({ day, items }));
    },
    [] as DayGroup[]
  );
}

async function loadMeta() {
  return safeQuery(
    async () => {
      const [unread, critical, warning, categories] = await Promise.all([
        db().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
        db()
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("severity", "CRITICAL")
          .is("read_at", null),
        db()
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("severity", "WARNING")
          .is("read_at", null),
        db().from("notifications").select("category").limit(1_000),
      ]);

      const distinct = [
        ...new Set(((categories.data ?? []) as { category: string }[]).map((row) => row.category)),
      ].sort();

      return {
        unread: unread.count ?? 0,
        critical: critical.count ?? 0,
        warning: warning.count ?? 0,
        categories: distinct,
      };
    },
    { unread: 0, critical: 0, warning: 0, categories: [] as string[] }
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const params = await searchParams;
  const [groups, meta] = await Promise.all([loadNotifications(params), loadMeta()]);

  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <PageHeader
        title="Notificações"
        description="Central de alertas do sistema: bloqueios automáticos, pagamentos confirmados e falhas de integração."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Não lidas"
            value={formatNumber(meta.unread)}
            icon={<BellRing />}
            tone={meta.unread > 0 ? "info" : "success"}
          />
          <StatCard
            label="Críticas em aberto"
            value={formatNumber(meta.critical)}
            hint={meta.critical > 0 ? "Exigem ação imediata" : "Nada crítico pendente"}
            icon={<CircleAlert />}
            tone={meta.critical > 0 ? "danger" : "neutral"}
          />
          <StatCard
            label="Avisos em aberto"
            value={formatNumber(meta.warning)}
            icon={<AlertTriangle />}
            tone={meta.warning > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Exibindo agora"
            value={formatNumber(shown)}
            hint={`Últimas ${LIMIT} notificações`}
            icon={<Bell />}
            tone="violet"
          />
        </StatGrid>
      </div>

      <NotificationsClient
        groups={groups}
        categories={meta.categories}
        unread={meta.unread}
      />
    </>
  );
}
