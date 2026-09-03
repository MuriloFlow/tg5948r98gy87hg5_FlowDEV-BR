import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { CheckCircle2, Clock, TrendingDown, Wallet } from "lucide-react";
import { can, requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import {
  ExpensesClient,
  type CategorySlice,
  type ExpenseRow,
  type ProjectOption,
} from "./expenses-client";

export const metadata: Metadata = { title: "Despesas" };
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  infra: "Infraestrutura",
  software: "Software e licenças",
  servicos: "Serviços",
  pessoal: "Pessoal",
  marketing: "Marketing",
  impostos: "Impostos",
  taxas: "Taxas do gateway",
  outros: "Outros",
};

interface SearchParams {
  q?: string;
  categoria?: string;
  situacao?: string;
  projeto?: string;
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

async function loadExpenses(params: SearchParams): Promise<ExpenseRow[]> {
  return safeQuery(async () => {
    let query = db()
      .from("expenses")
      .select("*")
      .order("due_date", { ascending: false, nullsFirst: false })
      .limit(300);

    if (params.categoria) query = query.eq("category", params.categoria);
    if (params.projeto) query = query.eq("project_id", params.projeto);
    if (params.situacao === "pago") query = query.not("paid_at", "is", null);
    if (params.situacao === "pendente") query = query.is("paid_at", null);
    if (params.q) query = query.ilike("description", `%${params.q}%`);

    const { data } = await query;
    const expenses = (data ?? []) as ExpenseRow[];

    const ids = [
      ...new Set(
        expenses.map((row) => row.project_id).filter((id): id is string => Boolean(id))
      ),
    ];

    if (ids.length > 0) {
      const { data: projects } = await db()
        .from("projects")
        .select("id, name, code")
        .in("id", ids);

      const names = new Map<string, string>(
        ((projects ?? []) as ProjectOption[]).map((project) => [project.id, project.name])
      );
      for (const row of expenses) {
        row.project_name = row.project_id ? (names.get(row.project_id) ?? null) : null;
      }
    }

    return expenses;
  }, []);
}

async function loadMonthSummary() {
  return safeQuery(
    async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data } = await db()
        .from("expenses")
        .select("amount, category, paid_at, due_date")
        .gte("due_date", start.toISOString().slice(0, 10))
        .lte("due_date", end.toISOString().slice(0, 10));

      const rows = (data ?? []) as {
        amount: number | string;
        category: string;
        paid_at: string | null;
      }[];

      let total = 0;
      let paid = 0;
      const byCategory = new Map<string, number>();

      for (const row of rows) {
        const amount = Number(row.amount ?? 0);
        total += amount;
        if (row.paid_at) paid += amount;
        byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + amount);
      }

      const categories: CategorySlice[] = [...byCategory.entries()]
        .map(([category, value]) => ({
          name: CATEGORY_LABELS[category] ?? category,
          value: Math.round(value * 100) / 100,
        }))
        .sort((a, b) => b.value - a.value);

      return { total, paid, pending: total - paid, categories };
    },
    { total: 0, paid: 0, pending: 0, categories: [] as CategorySlice[] }
  );
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("billing:read");
  const params = await searchParams;

  const [expenses, projects, summary] = await Promise.all([
    loadExpenses(params),
    loadProjects(),
    loadMonthSummary(),
  ]);

  const recurring = expenses.filter((expense) => expense.is_recurring).length;

  return (
    <>
      <PageHeader
        title="Despesas"
        description="Custos de infraestrutura, licenças e serviços — a base do seu fluxo de caixa."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Total do mês"
            value={formatCurrency(summary.total)}
            hint="Despesas com vencimento neste mês"
            icon={<Wallet />}
            tone="info"
          />
          <StatCard
            label="Já pago"
            value={formatCurrency(summary.paid)}
            icon={<CheckCircle2 />}
            tone="success"
          />
          <StatCard
            label="A pagar"
            value={formatCurrency(summary.pending)}
            icon={<Clock />}
            tone={summary.pending > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Despesas recorrentes"
            value={String(recurring)}
            hint="Repetem automaticamente todo ciclo"
            icon={<TrendingDown />}
            tone="violet"
          />
        </StatGrid>
      </div>

      <ExpensesClient
        expenses={expenses}
        projects={projects}
        categories={summary.categories}
        canWrite={can(user.role, "billing:write")}
      />
    </>
  );
}
