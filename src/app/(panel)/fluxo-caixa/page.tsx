import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { ArrowDownRight, ArrowUpRight, Scale, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatCurrency, parseDate } from "@/lib/format";
import type { MonthlyRevenue } from "@/lib/types";
import { CashflowClient, type CashMonth, type CashWeek } from "./cashflow-client";

export const metadata: Metadata = { title: "Fluxo de caixa" };
export const dynamic = "force-dynamic";

const MONTHS_BACK = 5;
const MONTHS_AHEAD = 6;

const MONTH_NAMES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const DAY_LABEL = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

function monthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Datas puras (YYYY-MM-DD) precisam ser lidas como locais para não trocar de mês. */
function toDate(value: string): Date {
  return parseDate(value) ?? new Date();
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

interface Movement {
  amount: number;
  date: string;
}

async function loadCashflow() {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD + 1, 0);
  const currentKey = monthKey(now);

  return safeQuery(
    async () => {
      const [openInvoices, paidInvoices, expenses, monthlyView] = await Promise.all([
        db()
          .from("invoices")
          .select("total, paid_amount, due_date")
          .in("status", ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"])
          .gte("due_date", isoDate(windowStart))
          .lte("due_date", isoDate(windowEnd))
          .limit(5000),
        db()
          .from("invoices")
          .select("paid_amount, paid_at")
          .not("paid_at", "is", null)
          .gte("paid_at", windowStart.toISOString())
          .limit(5000),
        db()
          .from("expenses")
          .select("amount, category, description, due_date, paid_at")
          .not("due_date", "is", null)
          .gte("due_date", isoDate(windowStart))
          .lte("due_date", isoDate(windowEnd))
          .limit(5000),
        db().from("v_monthly_revenue").select("*"),
      ]);

      const expected: Movement[] = ((openInvoices.data ?? []) as {
        total: number | string;
        paid_amount: number | string;
        due_date: string;
      }[]).map((row) => ({
        amount: Number(row.total ?? 0) - Number(row.paid_amount ?? 0),
        date: row.due_date,
      }));

      const received: Movement[] = ((paidInvoices.data ?? []) as {
        paid_amount: number | string;
        paid_at: string;
      }[]).map((row) => ({
        amount: Number(row.paid_amount ?? 0),
        date: row.paid_at,
      }));

      const outflows: Movement[] = ((expenses.data ?? []) as {
        amount: number | string;
        due_date: string;
      }[]).map((row) => ({ amount: Number(row.amount ?? 0), date: row.due_date }));

      /* ---- consolidação mensal ---- */
      const months: CashMonth[] = [];
      let balance = 0;

      for (let offset = -MONTHS_BACK; offset <= MONTHS_AHEAD; offset += 1) {
        const cursor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        const key = monthKey(cursor);

        const sumIn = (list: Movement[]) =>
          list.reduce(
            (sum, item) => (monthKey(toDate(item.date)) === key ? sum + item.amount : sum),
            0
          );

        const inflowReceived = sumIn(received);
        const inflowExpected = sumIn(expected);
        const outflow = sumIn(outflows);
        const net = inflowReceived + inflowExpected - outflow;
        balance += net;

        months.push({
          key,
          label: monthLabel(cursor),
          received: Math.round(inflowReceived * 100) / 100,
          expected: Math.round(inflowExpected * 100) / 100,
          outflow: Math.round(outflow * 100) / 100,
          net: Math.round(net * 100) / 100,
          balance: Math.round(balance * 100) / 100,
          isCurrent: key === currentKey,
          isFuture: cursor > new Date(now.getFullYear(), now.getMonth(), 1),
        });
      }

      /* ---- próximos 90 dias, por semana ---- */
      const weeks: CashWeek[] = [];
      let weekBalance = 0;
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (let index = 0; index < 13; index += 1) {
        const start = new Date(today);
        start.setDate(start.getDate() + index * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);

        const limit = new Date(end.getTime() + 86_399_000);
        const inRange = (value: string) => {
          const date = toDate(value);
          return date >= start && date <= limit;
        };

        const inflow = expected.reduce(
          (sum, item) => (inRange(item.date) ? sum + item.amount : sum),
          0
        );
        const outflow = outflows.reduce(
          (sum, item) => (inRange(item.date) ? sum + item.amount : sum),
          0
        );

        weekBalance += inflow - outflow;

        weeks.push({
          label: `${DAY_LABEL.format(start)} – ${DAY_LABEL.format(end)}`,
          inflow: Math.round(inflow * 100) / 100,
          outflow: Math.round(outflow * 100) / 100,
          balance: Math.round(weekBalance * 100) / 100,
        });
      }

      const monthly = ((monthlyView.data ?? []) as MonthlyRevenue[]).map((row) => ({
        month: String(row.month),
        label: row.label,
        received: Number(row.received ?? 0),
        expected: Number(row.expected ?? 0),
        overdue: Number(row.overdue ?? 0),
      }));

      return { months, weeks, monthly };
    },
    { months: [] as CashMonth[], weeks: [] as CashWeek[], monthly: [] as MonthlyRevenue[] }
  );
}

export default async function CashflowPage() {
  await requirePermission("billing:read");
  const { months, weeks, monthly } = await loadCashflow();

  const current = months.find((month) => month.isCurrent);
  const future = months.filter((month) => month.isFuture);
  const projectedIn = future.reduce((sum, month) => sum + month.expected, 0);
  const projectedOut = future.reduce((sum, month) => sum + month.outflow, 0);
  const finalBalance = months.length > 0 ? months[months.length - 1].balance : 0;

  return (
    <>
      <PageHeader
        title="Fluxo de caixa"
        description="Projeção de entradas e saídas mês a mês, com saldo acumulado e detalhamento semanal."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Saldo do mês atual"
            value={formatCurrency(current?.net ?? 0)}
            hint="Entradas menos saídas do mês corrente"
            icon={<Scale />}
            tone={(current?.net ?? 0) >= 0 ? "success" : "danger"}
          />
          <StatCard
            label="A receber (próximos meses)"
            value={formatCurrency(projectedIn)}
            icon={<ArrowUpRight />}
            tone="info"
          />
          <StatCard
            label="A pagar (próximos meses)"
            value={formatCurrency(projectedOut)}
            icon={<ArrowDownRight />}
            tone={projectedOut > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Saldo projetado no fim do período"
            value={formatCurrency(finalBalance)}
            hint={`Horizonte de ${months.length} meses`}
            icon={<Wallet />}
            tone={finalBalance >= 0 ? "violet" : "danger"}
          />
        </StatGrid>
      </div>

      <CashflowClient months={months} weeks={weeks} monthly={monthly} />
    </>
  );
}
