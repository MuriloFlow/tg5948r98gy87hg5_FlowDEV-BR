import type { Metadata } from "next";
import { AlertTriangle, Clock, Percent, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { isMercadoPagoConfigured } from "@/lib/env";
import { formatCurrency } from "@/lib/format";
import {
  RefundsTable,
  type RefundRow,
  type RefundablePayment,
} from "./refunds-table";
import type { PaymentMethod } from "@/lib/types";

export const metadata: Metadata = { title: "Reembolsos" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  status?: string;
  page?: string;
}

interface NestedPayment {
  method?: PaymentMethod;
  amount?: number;
  refunded_amount?: number;
  provider?: string;
  provider_payment_id?: string | null;
  created_at?: string;
  projects?: { name?: string } | { name?: string }[] | null;
  customers?: { name?: string } | { name?: string }[] | null;
}

interface JoinedRefund {
  [key: string]: unknown;
  payments?: NestedPayment | NestedPayment[] | null;
  invoices?: { code?: string } | { code?: string }[] | null;
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

async function loadRefunds(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("refunds")
        .select(
          "*, payments(method, amount, provider_payment_id, projects(name), customers(name)), invoices(code)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.status) query = query.eq("status", params.status);
      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(`reason.ilike.${like},provider_refund_id.ilike.${like}`);
      }

      const { data, count } = await query;

      const rows = ((data ?? []) as JoinedRefund[]).map((row) => {
        const payment = firstOf(row.payments);
        return {
          id: String(row.id),
          payment_id: String(row.payment_id),
          invoice_id: (row.invoice_id as string | null) ?? null,
          amount: Number(row.amount ?? 0),
          reason: (row.reason as string | null) ?? null,
          provider_refund_id: (row.provider_refund_id as string | null) ?? null,
          status: String(row.status ?? "PENDING"),
          created_at: String(row.created_at),
          payment_method: (payment?.method ?? "OTHER") as PaymentMethod,
          payment_amount: Number(payment?.amount ?? 0),
          payment_provider_id: payment?.provider_payment_id ?? null,
          customer_name: firstOf(payment?.customers)?.name ?? "—",
          project_name: firstOf(payment?.projects)?.name ?? "—",
          invoice_code: firstOf(row.invoices)?.code ?? null,
        } satisfies RefundRow;
      });

      return { rows, total: count ?? 0, page };
    },
    { rows: [] as RefundRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const [{ data: refunds }, { data: payments }] = await Promise.all([
        db().from("refunds").select("amount, status, created_at"),
        db().from("payments").select("amount, status"),
      ]);

      const all = (refunds ?? []) as { amount: number; status: string; created_at: string }[];
      const approvedPayments = ((payments ?? []) as { amount: number; status: string }[]).filter(
        (row) => ["APPROVED", "AUTHORIZED", "REFUNDED", "CHARGED_BACK"].includes(row.status)
      );

      const totalRefunded = all.reduce((sum, row) => sum + Number(row.amount), 0);
      const grossReceived = approvedPayments.reduce((sum, row) => sum + Number(row.amount), 0);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      return {
        totalRefunded,
        monthRefunded: all
          .filter((row) => new Date(row.created_at).getTime() >= monthStart.getTime())
          .reduce((sum, row) => sum + Number(row.amount), 0),
        pending: all.filter((row) => ["PENDING", "IN_PROCESS"].includes(row.status.toUpperCase()))
          .length,
        chargebacks: all.filter((row) => row.status.toUpperCase() === "CHARGED_BACK").length,
        rate: grossReceived > 0 ? (totalRefunded / grossReceived) * 100 : 0,
      };
    },
    { totalRefunded: 0, monthRefunded: 0, pending: 0, chargebacks: 0, rate: 0 }
  );
}

async function loadRefundablePayments() {
  return safeQuery(async () => {
    const { data } = await db()
      .from("payments")
      .select(
        "id, amount, refunded_amount, method, provider, provider_payment_id, created_at, invoices(code), projects(name), customers(name)"
      )
      .in("status", ["APPROVED", "AUTHORIZED"])
      .order("created_at", { ascending: false })
      .limit(200);

    return ((data ?? []) as JoinedRefund[])
      .map(
        (row) =>
          ({
            id: String(row.id),
            amount: Number(row.amount ?? 0),
            refunded_amount: Number(row.refunded_amount ?? 0),
            method: (row.method ?? "OTHER") as PaymentMethod,
            provider: String(row.provider ?? "mercadopago"),
            provider_payment_id: (row.provider_payment_id as string | null) ?? null,
            customer_name:
              firstOf(row.customers as { name?: string } | { name?: string }[] | null)?.name ?? "—",
            project_name:
              firstOf(row.projects as { name?: string } | { name?: string }[] | null)?.name ?? "—",
            invoice_code: firstOf(row.invoices)?.code ?? null,
            created_at: String(row.created_at),
          }) satisfies RefundablePayment
      )
      .filter((payment) => payment.amount - payment.refunded_amount > 0.01);
  }, [] as RefundablePayment[]);
}

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [{ rows, total, page }, summary, refundable] = await Promise.all([
    loadRefunds(params),
    loadSummary(),
    loadRefundablePayments(),
  ]);

  return (
    <>
      <PageHeader
        title="Reembolsos"
        description="Estornos totais e parciais, chargebacks e o rastro de cada devolução no gateway."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Total estornado"
            value={formatCurrency(summary.totalRefunded)}
            hint={`${formatCurrency(summary.monthRefunded)} neste mês`}
            icon={<Undo2 />}
            tone={summary.totalRefunded > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Taxa de estorno"
            value={`${summary.rate.toFixed(2).replace(".", ",")}%`}
            hint="Sobre o total recebido"
            icon={<Percent />}
            tone={summary.rate > 5 ? "danger" : "info"}
          />
          <StatCard
            label="Em processamento"
            value={String(summary.pending)}
            hint="Aguardando confirmação do gateway"
            icon={<Clock />}
            tone={summary.pending > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Chargebacks"
            value={String(summary.chargebacks)}
            hint={
              summary.chargebacks > 0
                ? "Contestações abertas pelo emissor"
                : "Nenhuma contestação registrada"
            }
            icon={<AlertTriangle />}
            tone={summary.chargebacks > 0 ? "danger" : "neutral"}
          />
        </StatGrid>
      </div>

      <RefundsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canRefund={can(user.role, "payments:refund")}
        refundablePayments={refundable}
        mercadoPagoConfigured={isMercadoPagoConfigured()}
      />
    </>
  );
}
