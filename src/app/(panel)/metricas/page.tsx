import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Clock, Percent, Receipt, Repeat, TrendingUp, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { BILLING_INTERVAL, PAYMENT_METHOD } from "@/lib/labels";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { BillingInterval, MonthlyRevenue, PaymentMethod } from "@/lib/types";
import {
  MetricsClient,
  type CustomerRevenue,
  type IntervalSlice,
  type MethodSlice,
} from "./metrics-client";

export const metadata: Metadata = { title: "Métricas" };
export const dynamic = "force-dynamic";

/** Fator de normalização de cada periodicidade para receita mensal. */
const MONTHLY_FACTOR: Record<BillingInterval, number> = {
  ONE_TIME: 0,
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  BIMONTHLY: 1 / 2,
  QUARTERLY: 1 / 3,
  SEMIANNUAL: 1 / 6,
  ANNUAL: 1 / 12,
};

async function loadRecurring() {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("subscriptions")
        .select("amount, interval, interval_count, status")
        .eq("status", "ACTIVE")
        .limit(5000);

      const rows = (data ?? []) as {
        amount: number | string;
        interval: BillingInterval;
        interval_count: number | null;
      }[];

      const byInterval = new Map<BillingInterval, { mrr: number; count: number }>();
      let mrr = 0;

      for (const row of rows) {
        const count = Math.max(1, Number(row.interval_count ?? 1));
        const monthly = (Number(row.amount ?? 0) * (MONTHLY_FACTOR[row.interval] ?? 0)) / count;
        mrr += monthly;

        const current = byInterval.get(row.interval) ?? { mrr: 0, count: 0 };
        byInterval.set(row.interval, { mrr: current.mrr + monthly, count: current.count + 1 });
      }

      const intervals: IntervalSlice[] = [...byInterval.entries()]
        .map(([interval, value]) => ({
          interval,
          label: BILLING_INTERVAL[interval]?.label ?? interval,
          subscriptions: value.count,
          mrr: Math.round(value.mrr * 100) / 100,
        }))
        .sort((a, b) => b.mrr - a.mrr);

      return { mrr, active: rows.length, intervals };
    },
    { mrr: 0, active: 0, intervals: [] as IntervalSlice[] }
  );
}

async function loadInvoiceMetrics() {
  return safeQuery(
    async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 12);

      const [paid, summary] = await Promise.all([
        db()
          .from("invoices")
          .select("total, due_date, paid_at")
          .eq("status", "PAID")
          .not("paid_at", "is", null)
          .gte("paid_at", since.toISOString())
          .limit(5000),
        db().from("v_financial_summary").select("*").maybeSingle(),
      ]);

      const rows = (paid.data ?? []) as {
        total: number | string;
        due_date: string;
        paid_at: string;
      }[];

      const totalPaid = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
      const ticket = rows.length > 0 ? totalPaid / rows.length : 0;

      let daysSum = 0;
      let daysCount = 0;
      let onTime = 0;

      for (const row of rows) {
        if (!row.due_date || !row.paid_at) continue;
        const due = new Date(`${row.due_date}T12:00:00`).getTime();
        const paidAt = new Date(row.paid_at).getTime();
        const diff = Math.round((paidAt - due) / 86_400_000);
        daysSum += diff;
        daysCount += 1;
        if (diff <= 0) onTime += 1;
      }

      const financial = (summary.data ?? null) as {
        total_received: number | string;
        total_to_receive: number | string;
        total_overdue: number | string;
      } | null;

      const received = Number(financial?.total_received ?? 0);
      const toReceive = Number(financial?.total_to_receive ?? 0);
      const overdue = Number(financial?.total_overdue ?? 0);
      const base = received + toReceive + overdue;

      return {
        ticket,
        paidCount: rows.length,
        avgDays: daysCount > 0 ? daysSum / daysCount : 0,
        onTimeRate: daysCount > 0 ? (onTime / daysCount) * 100 : 0,
        defaultRate: base > 0 ? (overdue / base) * 100 : 0,
        overdue,
        received,
      };
    },
    {
      ticket: 0,
      paidCount: 0,
      avgDays: 0,
      onTimeRate: 0,
      defaultRate: 0,
      overdue: 0,
      received: 0,
    }
  );
}

async function loadMethods(): Promise<MethodSlice[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("payments")
      .select("method, amount")
      .eq("status", "APPROVED")
      .limit(5000);

    const rows = (data ?? []) as { method: PaymentMethod; amount: number | string }[];
    const grouped = new Map<PaymentMethod, { value: number; count: number }>();

    for (const row of rows) {
      const current = grouped.get(row.method) ?? { value: 0, count: 0 };
      grouped.set(row.method, {
        value: current.value + Number(row.amount ?? 0),
        count: current.count + 1,
      });
    }

    return [...grouped.entries()]
      .map(([method, value]) => ({
        name: PAYMENT_METHOD[method]?.label ?? method,
        value: Math.round(value.value * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => b.value - a.value);
  }, []);
}

async function loadTopCustomers(): Promise<CustomerRevenue[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("v_customer_revenue")
      .select("id, name, total_paid, total_open, total_overdue, projects_count")
      .order("total_paid", { ascending: false })
      .limit(10);

    return ((data ?? []) as CustomerRevenue[]).map((row) => ({
      id: row.id,
      name: row.name,
      total_paid: Number(row.total_paid ?? 0),
      total_open: Number(row.total_open ?? 0),
      total_overdue: Number(row.total_overdue ?? 0),
      projects_count: Number(row.projects_count ?? 0),
    }));
  }, []);
}

async function loadMonthly(): Promise<MonthlyRevenue[]> {
  return safeQuery(async () => {
    const { data } = await db().from("v_monthly_revenue").select("*");
    return ((data ?? []) as MonthlyRevenue[]).map((row) => ({
      month: String(row.month),
      label: row.label,
      received: Number(row.received ?? 0),
      expected: Number(row.expected ?? 0),
      overdue: Number(row.overdue ?? 0),
    }));
  }, []);
}

export default async function MetricsPage() {
  await requirePermission("billing:read");

  const [recurring, invoices, methods, customers, monthly] = await Promise.all([
    loadRecurring(),
    loadInvoiceMetrics(),
    loadMethods(),
    loadTopCustomers(),
    loadMonthly(),
  ]);

  return (
    <>
      <PageHeader
        title="Métricas do negócio"
        description="Receita recorrente, ticket médio, inadimplência e comportamento de pagamento."
      />

      <div className="mb-4">
        <StatGrid>
          <StatCard
            label="MRR — receita recorrente mensal"
            value={formatCurrency(recurring.mrr)}
            hint={`${formatNumber(recurring.active)} assinatura(s) ativa(s)`}
            icon={<Repeat />}
            tone="violet"
          />
          <StatCard
            label="ARR — receita anual projetada"
            value={formatCurrency(recurring.mrr * 12)}
            hint="MRR × 12"
            icon={<TrendingUp />}
            tone="info"
          />
          <StatCard
            label="Ticket médio"
            value={formatCurrency(invoices.ticket)}
            hint={`${formatNumber(invoices.paidCount)} cobrança(s) paga(s) em 12 meses`}
            icon={<Receipt />}
            tone="success"
          />
          <StatCard
            label="Taxa de inadimplência"
            value={formatPercent(invoices.defaultRate)}
            hint={`${formatCurrency(invoices.overdue)} vencidos`}
            icon={<Percent />}
            tone={invoices.defaultRate > 5 ? "danger" : invoices.defaultRate > 0 ? "warning" : "neutral"}
            href="/inadimplencia"
          />
        </StatGrid>
      </div>

      <div className="mb-6">
        <StatGrid columns={3}>
          <StatCard
            label="Tempo médio de pagamento"
            value={
              invoices.avgDays === 0
                ? "—"
                : `${invoices.avgDays > 0 ? "+" : ""}${invoices.avgDays.toFixed(1).replace(".", ",")} dias`
            }
            hint="Diferença média entre vencimento e pagamento"
            icon={<Clock />}
            tone={invoices.avgDays > 3 ? "warning" : "success"}
          />
          <StatCard
            label="Pagamentos em dia"
            value={formatPercent(invoices.onTimeRate)}
            hint="Cobranças quitadas até o vencimento"
            icon={<Percent />}
            tone={invoices.onTimeRate >= 80 ? "success" : "warning"}
          />
          <StatCard
            label="Total já recebido"
            value={formatCurrency(invoices.received)}
            hint="Histórico completo"
            icon={<Wallet />}
            tone="info"
          />
        </StatGrid>
      </div>

      <MetricsClient
        monthly={monthly}
        methods={methods}
        customers={customers}
        intervals={recurring.intervals}
        mrr={recurring.mrr}
      />
    </>
  );
}
