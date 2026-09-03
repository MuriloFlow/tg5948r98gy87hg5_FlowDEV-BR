import type { Metadata } from "next";
import { CheckCircle2, Eye, Link2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env, isMercadoPagoConfigured } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/format";
import { LinksTable, type PaymentLinkRow } from "./links-table";
import type { InvoiceOption } from "./link-form";
import type { ProjectOption } from "../cobrancas/invoice-form";

export const metadata: Metadata = { title: "Payment Links" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  status?: string;
  projeto?: string;
  origem?: string;
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

async function loadLinks(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("payment_links")
        .select("*, projects(name), customers(name), invoices(code)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.status) query = query.eq("status", params.status);
      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.origem === "cobranca") query = query.not("invoice_id", "is", null);
      if (params.origem === "avulso") query = query.is("invoice_id", null);
      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(`title.ilike.${like},token.ilike.${like},short_code.ilike.${like}`);
      }

      const { data, count } = await query;

      const rows = ((data ?? []) as JoinedRow[]).map(
        (row) =>
          ({
            ...(row as unknown as PaymentLinkRow),
            project_name: firstOf(row.projects)?.name ?? "—",
            customer_name: firstOf(row.customers)?.name ?? "—",
            invoice_code: firstOf(row.invoices)?.code ?? null,
          }) as PaymentLinkRow
      );

      return { rows, total: count ?? 0, page };
    },
    { rows: [] as PaymentLinkRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("payment_links")
        .select("status, amount, view_count, checkout_url");

      const all = (data ?? []) as {
        status: string;
        amount: number;
        view_count: number;
        checkout_url: string | null;
      }[];

      const active = all.filter((row) => row.status === "ACTIVE");
      return {
        activeCount: active.length,
        activeAmount: active.reduce((sum, row) => sum + Number(row.amount), 0),
        paidCount: all.filter((row) => row.status === "PAID").length,
        views: all.reduce((sum, row) => sum + Number(row.view_count ?? 0), 0),
        withoutCheckout: active.filter((row) => !row.checkout_url).length,
      };
    },
    { activeCount: 0, activeAmount: 0, paidCount: 0, views: 0, withoutCheckout: 0 }
  );
}

async function loadOptions() {
  return safeQuery(
    async () => {
      const [{ data: projects }, { data: invoices }] = await Promise.all([
        db()
          .from("projects")
          .select("id, name, code, customer_id, customers(name)")
          .neq("status", "ARCHIVED")
          .order("name", { ascending: true }),
        db()
          .from("v_invoices_full")
          .select("id, code, description, project_id, balance_due")
          .in("status", ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"])
          .order("due_date", { ascending: true })
          .limit(300),
      ]);

      const projectOptions = ((projects ?? []) as JoinedRow[]).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        code: String(row.code),
        customer_id: String(row.customer_id),
        customer_name: firstOf(row.customers)?.name ?? "—",
      })) as ProjectOption[];

      const invoiceOptions = (invoices ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code),
        description: String(row.description),
        project_id: String(row.project_id),
        balance_due: Number(row.balance_due ?? 0),
      })) as InvoiceOption[];

      return { projects: projectOptions, invoices: invoiceOptions };
    },
    { projects: [] as ProjectOption[], invoices: [] as InvoiceOption[] }
  );
}

export default async function PaymentLinksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [{ rows, total, page }, summary, options] = await Promise.all([
    loadLinks(params),
    loadSummary(),
    loadOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Payment Links"
        description="Links públicos de pagamento — avulsos ou vinculados a uma cobrança, com Pix, cartão e boleto."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Links ativos"
            value={String(summary.activeCount)}
            hint={`${formatCurrency(summary.activeAmount)} disponíveis para pagamento`}
            icon={<Link2 />}
            tone="info"
          />
          <StatCard
            label="Valor em links ativos"
            value={formatCurrency(summary.activeAmount)}
            hint="Soma dos links aguardando pagamento"
            icon={<Wallet />}
            tone="violet"
          />
          <StatCard
            label="Links pagos"
            value={String(summary.paidCount)}
            hint="Pagamentos confirmados pelo gateway"
            icon={<CheckCircle2 />}
            tone="success"
          />
          <StatCard
            label="Visualizações"
            value={formatNumber(summary.views)}
            hint={
              summary.withoutCheckout > 0
                ? `${summary.withoutCheckout} link(s) sem checkout provisionado`
                : "Todos os links ativos têm checkout"
            }
            icon={<Eye />}
            tone={summary.withoutCheckout > 0 ? "warning" : "neutral"}
          />
        </StatGrid>
      </div>

      <LinksTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canWrite={can(user.role, "billing:write")}
        projects={options.projects}
        invoices={options.invoices}
        appUrl={env.publicAppUrl}
        mercadoPagoConfigured={isMercadoPagoConfigured()}
        presetProjectId={params.projeto ?? null}
      />
    </>
  );
}
