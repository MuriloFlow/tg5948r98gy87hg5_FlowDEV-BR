import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Blocks, CheckCircle2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatCurrency, formatDocument } from "@/lib/format";
import { ENTITY_STATUS } from "@/lib/labels";
import type {
  ActivityEntry,
  Company,
  Customer,
  InvoiceFull,
  Payment,
  Project,
} from "@/lib/types";
import {
  CustomerHeaderActions,
  CustomerTabs,
  type CustomerContact,
  type CustomerDetailData,
} from "./customer-tabs";

export const metadata: Metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

const EMPTY: CustomerDetailData = {
  companies: [],
  contacts: [],
  projects: [],
  invoices: [],
  payments: [],
  activity: [],
};

async function loadCustomer(id: string): Promise<Customer | null> {
  return safeQuery(async () => {
    const { data } = await db().from("customers").select("*").eq("id", id).maybeSingle();
    if (!data) return null;

    const customer = data as Customer;
    return {
      ...customer,
      tags: customer.tags ?? [],
      default_payment_methods: customer.default_payment_methods ?? [],
    };
  }, null);
}

async function loadDetail(customerId: string): Promise<CustomerDetailData> {
  return safeQuery(async () => {
    const [companies, contacts, projects, invoices, payments] = await Promise.all([
      db()
        .from("companies")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      db()
        .from("customer_contacts")
        .select("id, name, role, email, phone, is_primary, receives_billing")
        .eq("customer_id", customerId)
        .order("is_primary", { ascending: false })
        .order("name"),
      db()
        .from("projects")
        .select("*")
        .eq("customer_id", customerId)
        .neq("status", "ARCHIVED")
        .order("created_at", { ascending: false }),
      db()
        .from("v_invoices_full")
        .select("*")
        .eq("customer_id", customerId)
        .order("due_date", { ascending: false })
        .limit(100),
      db()
        .from("payments")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const projectRows = (projects.data ?? []) as Project[];

    // a linha do tempo cobre o próprio cliente e todos os projetos dele
    let activityQuery = db()
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    const projectIds = projectRows.map((project) => project.id);
    activityQuery =
      projectIds.length > 0
        ? activityQuery.or(
            `and(entity_type.eq.customer,entity_id.eq.${customerId}),project_id.in.(${projectIds.join(",")})`
          )
        : activityQuery.eq("entity_type", "customer").eq("entity_id", customerId);

    const { data: activity } = await activityQuery;

    return {
      companies: (companies.data ?? []) as Company[],
      contacts: (contacts.data ?? []) as CustomerContact[],
      projects: projectRows.map((project) => ({
        ...project,
        monthly_amount: Number(project.monthly_amount ?? 0),
        contract_value: Number(project.contract_value ?? 0),
      })),
      invoices: ((invoices.data ?? []) as InvoiceFull[]).map((invoice) => ({
        ...invoice,
        total: Number(invoice.total ?? 0),
        paid_amount: Number(invoice.paid_amount ?? 0),
        balance_due: Number(invoice.balance_due ?? 0),
        days_overdue: Number(invoice.days_overdue ?? 0),
      })),
      payments: ((payments.data ?? []) as Payment[]).map((payment) => ({
        ...payment,
        amount: Number(payment.amount ?? 0),
        net_amount: payment.net_amount != null ? Number(payment.net_amount) : null,
      })),
      activity: (activity ?? []) as ActivityEntry[],
    };
  }, EMPTY);
}

function summarize(data: CustomerDetailData) {
  return data.invoices.reduce(
    (acc, invoice) => {
      if (invoice.status === "PAID") acc.paid += invoice.total;
      if (["OPEN", "PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
        acc.open += invoice.balance_due;
      }
      if (invoice.status === "OVERDUE") acc.overdue += invoice.balance_due;
      return acc;
    },
    { paid: 0, open: 0, overdue: 0 }
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const customer = await loadCustomer(id);
  if (!customer) notFound();

  const data = await loadDetail(customer.id);
  const totals = summarize(data);

  return (
    <>
      <PageHeader
        backHref="/clientes"
        backLabel="Clientes"
        title={customer.legal_name || customer.name}
        description={customer.legal_name ? customer.name : undefined}
        meta={<StatusBadge meta={ENTITY_STATUS[customer.status]} />}
        actions={
          <CustomerHeaderActions
            customer={customer}
            canWrite={can(user.role, "customers:write")}
          />
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-500">
        <span className="font-mono text-ink-400">{customer.code}</span>
        <span>{customer.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</span>
        {customer.document && <span>{formatDocument(customer.document)}</span>}
        {(customer.city || customer.state) && (
          <span>{[customer.city, customer.state].filter(Boolean).join(" / ")}</span>
        )}
      </div>

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Total recebido"
            value={formatCurrency(totals.paid)}
            icon={<CheckCircle2 />}
            tone="success"
          />
          <StatCard
            label="Em aberto"
            value={formatCurrency(totals.open)}
            icon={<Wallet />}
            tone={totals.open > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Vencido"
            value={formatCurrency(totals.overdue)}
            hint={totals.overdue > 0 ? "Sujeito a bloqueio automático" : "Nada em atraso"}
            icon={<AlertTriangle />}
            tone={totals.overdue > 0 ? "danger" : "neutral"}
          />
          <StatCard
            label="Projetos ativos"
            value={String(data.projects.length)}
            icon={<Blocks />}
            tone="info"
          />
        </StatGrid>
      </div>

      <CustomerTabs customer={customer} data={data} />
    </>
  );
}
