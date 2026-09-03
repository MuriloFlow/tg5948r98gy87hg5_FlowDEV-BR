import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { CheckCircle2, Users, Wallet, AlertTriangle } from "lucide-react";
import { requireUser, can } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { CustomersTable, type CustomerRow } from "./customers-table";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  status?: string;
  type?: string;
  page?: string;
}

async function loadCustomers(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("customers")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.status) query = query.eq("status", params.status);
      else query = query.neq("status", "ARCHIVED");

      if (params.type) query = query.eq("type", params.type);

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `name.ilike.${like},legal_name.ilike.${like},email.ilike.${like},document.ilike.${like},code.ilike.${like}`
        );
      }

      const { data, count } = await query;
      const customers = (data ?? []) as CustomerRow[];

      // agrega projetos e valores em aberto de uma vez só
      const ids = customers.map((c) => c.id);
      if (ids.length > 0) {
        const [{ data: projects }, { data: invoices }] = await Promise.all([
          db().from("projects").select("customer_id").in("customer_id", ids).neq("status", "ARCHIVED"),
          db()
            .from("invoices")
            .select("customer_id, total, paid_amount, status")
            .in("customer_id", ids)
            .in("status", ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"]),
        ]);

        for (const customer of customers) {
          customer.projects_count = (projects ?? []).filter(
            (p) => p.customer_id === customer.id
          ).length;

          const own = (invoices ?? []).filter((i) => i.customer_id === customer.id);
          customer.total_open = own.reduce(
            (sum, i) => sum + (Number(i.total) - Number(i.paid_amount)),
            0
          );
          customer.total_overdue = own
            .filter((i) => i.status === "OVERDUE")
            .reduce((sum, i) => sum + (Number(i.total) - Number(i.paid_amount)), 0);
        }
      }

      return { customers, total: count ?? 0, page };
    },
    { customers: [] as CustomerRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const [active, withDebt, revenue] = await Promise.all([
        db().from("customers").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        db()
          .from("v_customer_revenue")
          .select("id, total_overdue")
          .gt("total_overdue", 0),
        db().from("v_customer_revenue").select("total_paid, total_open"),
      ]);

      const totals = (revenue.data ?? []).reduce(
        (acc, row: { total_paid: number; total_open: number }) => ({
          paid: acc.paid + Number(row.total_paid ?? 0),
          open: acc.open + Number(row.total_open ?? 0),
        }),
        { paid: 0, open: 0 }
      );

      return {
        active: active.count ?? 0,
        withDebt: withDebt.data?.length ?? 0,
        totalPaid: totals.paid,
        totalOpen: totals.open,
      };
    },
    { active: 0, withDebt: 0, totalPaid: 0, totalOpen: 0 }
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [{ customers, total, page }, summary] = await Promise.all([
    loadCustomers(params),
    loadSummary(),
  ]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro central de clientes, empresas e preferências de cobrança."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Clientes ativos"
            value={String(summary.active)}
            icon={<Users />}
            tone="info"
          />
          <StatCard
            label="Total já recebido"
            value={formatCurrency(summary.totalPaid)}
            icon={<CheckCircle2 />}
            tone="success"
          />
          <StatCard
            label="Em aberto"
            value={formatCurrency(summary.totalOpen)}
            icon={<Wallet />}
            tone="warning"
          />
          <StatCard
            label="Com pendência"
            value={String(summary.withDebt)}
            hint="Clientes com cobrança vencida"
            icon={<AlertTriangle />}
            tone={summary.withDebt > 0 ? "danger" : "neutral"}
            href="/inadimplencia"
          />
        </StatGrid>
      </div>

      <CustomersTable
        rows={customers}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canWrite={can(user.role, "customers:write")}
      />
    </>
  );
}
