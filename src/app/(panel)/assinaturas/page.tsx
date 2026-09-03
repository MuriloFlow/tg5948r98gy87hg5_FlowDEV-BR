import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Repeat, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Button } from "@/components/ui/button";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { SubscriptionsTable, type SubscriptionRow } from "./subscriptions-table";
import { monthlyValue } from "./subscription-form";
import type { ProjectOption } from "../cobrancas/invoice-form";

export const metadata: Metadata = { title: "Assinaturas" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  status?: string;
  intervalo?: string;
  projeto?: string;
  page?: string;
}

interface JoinedRow {
  [key: string]: unknown;
  projects?: { name?: string; code?: string } | { name?: string; code?: string }[] | null;
  customers?: { name?: string } | { name?: string }[] | null;
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

async function loadSubscriptions(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("subscriptions")
        .select("*, projects(name, code), customers(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.status) query = query.eq("status", params.status);
      if (params.intervalo) query = query.eq("interval", params.intervalo);
      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(`name.ilike.${like},description.ilike.${like}`);
      }

      const { data, count } = await query;

      const rows = ((data ?? []) as JoinedRow[]).map((row) => {
        const project = firstOf(row.projects);
        const customer = firstOf(row.customers);
        return {
          ...(row as unknown as SubscriptionRow),
          project_name: project?.name ?? "—",
          project_code: project?.code ?? "—",
          customer_name: customer?.name ?? "—",
        } as SubscriptionRow;
      });

      return { rows, total: count ?? 0, page };
    },
    { rows: [] as SubscriptionRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("subscriptions")
        .select("amount, interval, interval_count, status, next_billing_date");

      const all = (data ?? []) as {
        amount: number;
        interval: SubscriptionRow["interval"];
        interval_count: number;
        status: SubscriptionRow["status"];
        next_billing_date: string | null;
      }[];

      const active = all.filter((row) => row.status === "ACTIVE");
      const mrr = active.reduce(
        (sum, row) =>
          sum + monthlyValue(Number(row.amount), row.interval, Number(row.interval_count)),
        0
      );

      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 30);
      const next30 = active
        .filter(
          (row) =>
            row.next_billing_date && new Date(row.next_billing_date).getTime() <= horizon.getTime()
        )
        .reduce((sum, row) => sum + Number(row.amount), 0);

      return {
        mrr,
        activeCount: active.length,
        next30,
        pastDue: all.filter((row) => row.status === "PAST_DUE").length,
      };
    },
    { mrr: 0, activeCount: 0, next30: 0, pastDue: 0 }
  );
}

async function loadProjects() {
  return safeQuery(async () => {
    const { data } = await db()
      .from("projects")
      .select("id, name, code, customer_id, customers(name)")
      .neq("status", "ARCHIVED")
      .order("name", { ascending: true });

    return ((data ?? []) as JoinedRow[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      code: String(row.code),
      customer_id: String(row.customer_id),
      customer_name: firstOf(row.customers)?.name ?? "—",
    })) as ProjectOption[];
  }, [] as ProjectOption[]);
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [{ rows, total, page }, summary, projects] = await Promise.all([
    loadSubscriptions(params),
    loadSummary(),
    loadProjects(),
  ]);

  return (
    <>
      <PageHeader
        title="Assinaturas"
        description="Recorrências que geram cobranças automaticamente — mensalidades, licenças e contratos com dia fixo."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/cobrancas">Ver cobranças</Link>
          </Button>
        }
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="MRR ativo"
            value={formatCurrency(summary.mrr)}
            hint="Receita recorrente normalizada por mês"
            icon={<TrendingUp />}
            tone="success"
          />
          <StatCard
            label="Recorrências ativas"
            value={String(summary.activeCount)}
            hint={`${total} cadastrada(s) no total`}
            icon={<Repeat />}
            tone="info"
          />
          <StatCard
            label="A faturar em 30 dias"
            value={formatCurrency(summary.next30)}
            hint="Soma dos ciclos com vencimento no período"
            icon={<CalendarClock />}
            tone="violet"
          />
          <StatCard
            label="Inadimplentes"
            value={String(summary.pastDue)}
            hint={
              summary.pastDue > 0
                ? "Recorrências com cobrança vencida"
                : "Nenhuma recorrência em atraso"
            }
            icon={<AlertTriangle />}
            tone={summary.pastDue > 0 ? "danger" : "neutral"}
            href="/inadimplencia"
          />
        </StatGrid>
      </div>

      <SubscriptionsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canWrite={can(user.role, "billing:write")}
        projects={projects}
        presetProjectId={params.projeto ?? null}
      />
    </>
  );
}
