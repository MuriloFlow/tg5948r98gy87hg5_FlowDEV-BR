import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CircleDollarSign, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Button } from "@/components/ui/button";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env } from "@/lib/env";
import { getFinancialSummary } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { InvoicesTable, type CustomerOption } from "./invoices-table";
import type { ProjectOption } from "./invoice-form";
import type { InvoiceFull } from "@/lib/types";

export const metadata: Metadata = { title: "Cobranças" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  status?: string;
  projeto?: string;
  cliente?: string;
  periodo?: string;
  page?: string;
  novo?: string;
}

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

async function loadInvoices(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("v_invoices_full")
        .select("*", { count: "exact" })
        .order("due_date", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.status) query = query.eq("status", params.status);
      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.cliente) query = query.eq("customer_id", params.cliente);

      const today = isoDate();
      switch (params.periodo) {
        case "atrasadas":
          query = query.lt("due_date", today);
          break;
        case "hoje":
          query = query.eq("due_date", today);
          break;
        case "7":
        case "15":
        case "30":
          query = query.gte("due_date", today).lte("due_date", isoDate(Number(params.periodo)));
          break;
        case "mes": {
          const now = new Date();
          const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
          const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          const lastIso = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(
            last.getDate()
          ).padStart(2, "0")}`;
          query = query.gte("due_date", first).lte("due_date", lastIso);
          break;
        }
        default:
          break;
      }

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `code.ilike.${like},description.ilike.${like},reference.ilike.${like},customer_name.ilike.${like}`
        );
      }

      const { data, count } = await query;
      return { invoices: (data ?? []) as InvoiceFull[], total: count ?? 0, page };
    },
    { invoices: [] as InvoiceFull[], total: 0, page: 1 }
  );
}

async function loadOptions() {
  return safeQuery(
    async () => {
      const [{ data: projects }, { data: customers }] = await Promise.all([
        db()
          .from("projects")
          .select("id, name, code, customer_id, customers(name)")
          .neq("status", "ARCHIVED")
          .order("name", { ascending: true }),
        db()
          .from("customers")
          .select("id, name")
          .neq("status", "ARCHIVED")
          .order("name", { ascending: true }),
      ]);

      const projectOptions: ProjectOption[] = (projects ?? []).map((row) => {
        const joined = (row as { customers?: { name?: string } | { name?: string }[] | null })
          .customers;
        const customerName = Array.isArray(joined) ? joined[0]?.name : joined?.name;
        return {
          id: String(row.id),
          name: String(row.name),
          code: String(row.code),
          customer_id: String(row.customer_id),
          customer_name: customerName ?? "—",
        };
      });

      return {
        projects: projectOptions,
        customers: (customers ?? []).map((row) => ({
          id: String(row.id),
          name: String(row.name),
        })) as CustomerOption[],
      };
    },
    { projects: [] as ProjectOption[], customers: [] as CustomerOption[] }
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [{ invoices, total, page }, summary, options] = await Promise.all([
    loadInvoices(params),
    getFinancialSummary(),
    loadOptions(),
  ]);

  const averageTicket =
    summary.paid_count > 0 ? summary.total_received / summary.paid_count : 0;

  const canWrite = can(user.role, "billing:write");

  return (
    <>
      <PageHeader
        title="Cobranças"
        description="Todas as faturas emitidas, com vencimento, link de pagamento e situação de bloqueio."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/assinaturas">Recorrências</Link>
          </Button>
        }
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="A receber"
            value={formatCurrency(summary.total_to_receive)}
            hint={`${summary.open_count} em aberto · ${formatCurrency(summary.due_this_month)} neste mês`}
            icon={<Wallet />}
            tone="info"
          />
          <StatCard
            label="Recebido no mês"
            value={formatCurrency(summary.received_this_month)}
            hint={`Histórico: ${formatCurrency(summary.total_received)}`}
            icon={<TrendingUp />}
            tone="success"
          />
          <StatCard
            label="Atrasado"
            value={formatCurrency(summary.total_overdue)}
            hint={`${summary.overdue_count} cobrança(s) vencida(s)`}
            icon={<AlertTriangle />}
            tone={summary.total_overdue > 0 ? "danger" : "neutral"}
            href="/inadimplencia"
          />
          <StatCard
            label="Ticket médio"
            value={formatCurrency(averageTicket)}
            hint={`Base de ${summary.paid_count} cobrança(s) paga(s)`}
            icon={<CircleDollarSign />}
            tone="violet"
          />
        </StatGrid>
      </div>

      <InvoicesTable
        rows={invoices}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canWrite={canWrite}
        projects={options.projects}
        customers={options.customers}
        appUrl={env.appUrl}
        autoOpenNew={canWrite && params.novo === "1"}
        presetProjectId={params.projeto ?? null}
      />
    </>
  );
}
