import type { Metadata } from "next";
import { CheckCircle2, CreditCard, Percent, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { isMercadoPagoConfigured } from "@/lib/env";
import { formatCurrency } from "@/lib/format";
import { PaymentsTable, type PaymentRow } from "./payments-table";
import type { ProjectOption } from "../cobrancas/invoice-form";

export const metadata: Metadata = { title: "Pagamentos" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  metodo?: string;
  status?: string;
  periodo?: string;
  projeto?: string;
  page?: string;
}

interface JoinedRow {
  [key: string]: unknown;
  projects?: { name?: string } | { name?: string }[] | null;
  customers?: { name?: string } | { name?: string }[] | null;
  invoices?: { code?: string } | { code?: string }[] | null;
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

function sinceIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

async function loadPayments(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("payments")
        .select("*, projects(name), customers(name), invoices(code)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.metodo) query = query.eq("method", params.metodo);
      if (params.status) query = query.eq("status", params.status);
      if (params.projeto) query = query.eq("project_id", params.projeto);

      switch (params.periodo) {
        case "hoje":
          query = query.gte("created_at", sinceIso(0));
          break;
        case "7":
        case "30":
        case "90":
          query = query.gte("created_at", sinceIso(Number(params.periodo)));
          break;
        case "mes": {
          const now = new Date();
          const first = new Date(now.getFullYear(), now.getMonth(), 1);
          query = query.gte("created_at", first.toISOString());
          break;
        }
        default:
          break;
      }

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `provider_payment_id.ilike.${like},payer_name.ilike.${like},payer_email.ilike.${like}`
        );
      }

      const { data, count } = await query;

      const rows = ((data ?? []) as JoinedRow[]).map(
        (row) =>
          ({
            ...(row as unknown as PaymentRow),
            project_name: firstOf(row.projects)?.name ?? "—",
            customer_name: firstOf(row.customers)?.name ?? "—",
            invoice_code: firstOf(row.invoices)?.code ?? null,
          }) as PaymentRow
      );

      return { rows, total: count ?? 0, page };
    },
    { rows: [] as PaymentRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("payments")
        .select("status, amount, fee_amount, net_amount, refunded_amount, created_at");

      const all = (data ?? []) as {
        status: string;
        amount: number;
        fee_amount: number;
        net_amount: number | null;
        refunded_amount: number;
        created_at: string;
      }[];

      const approved = all.filter(
        (row) => row.status === "APPROVED" || row.status === "AUTHORIZED"
      );
      const gross = approved.reduce((sum, row) => sum + Number(row.amount), 0);
      const fees = approved.reduce((sum, row) => sum + Number(row.fee_amount ?? 0), 0);
      const refunded = all.reduce((sum, row) => sum + Number(row.refunded_amount ?? 0), 0);

      return {
        approvedCount: approved.length,
        gross,
        fees,
        net: gross - fees,
        refunded,
        approvalRate: all.length > 0 ? (approved.length / all.length) * 100 : 0,
      };
    },
    { approvedCount: 0, gross: 0, fees: 0, net: 0, refunded: 0, approvalRate: 0 }
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

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [{ rows, total, page }, summary, projects] = await Promise.all([
    loadPayments(params),
    loadSummary(),
    loadProjects(),
  ]);

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Todas as transações recebidas — pelo gateway ou por baixa manual — com taxa, líquido e status."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Recebido (bruto)"
            value={formatCurrency(summary.gross)}
            hint={`${summary.approvedCount} transação(ões) aprovada(s)`}
            icon={<CheckCircle2 />}
            tone="success"
          />
          <StatCard
            label="Líquido"
            value={formatCurrency(summary.net)}
            hint={`${formatCurrency(summary.fees)} em taxas do gateway`}
            icon={<CreditCard />}
            tone="info"
          />
          <StatCard
            label="Taxa de aprovação"
            value={`${summary.approvalRate.toFixed(1).replace(".", ",")}%`}
            hint="Aprovadas sobre o total de tentativas"
            icon={<Percent />}
            tone="violet"
          />
          <StatCard
            label="Estornado"
            value={formatCurrency(summary.refunded)}
            hint="Somando estornos e chargebacks"
            icon={<Undo2 />}
            tone={summary.refunded > 0 ? "warning" : "neutral"}
            href="/reembolsos"
          />
        </StatGrid>
      </div>

      <PaymentsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canRefund={can(user.role, "payments:refund")}
        canWrite={can(user.role, "billing:write")}
        projects={projects}
        mercadoPagoConfigured={isMercadoPagoConfigured()}
      />
    </>
  );
}
