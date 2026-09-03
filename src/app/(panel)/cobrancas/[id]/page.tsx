import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/panel/page-header";
import { Badge } from "@/components/ui/badge";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env, isMercadoPagoConfigured } from "@/lib/env";
import { formatCurrency } from "@/lib/format";
import { InvoiceDetail, type InvoiceCustomer } from "./invoice-detail";
import type { ProjectOption } from "../invoice-form";
import type {
  ActivityEntry,
  InvoiceFull,
  InvoiceItem,
  Payment,
  PaymentLink,
} from "@/lib/types";

export const metadata: Metadata = { title: "Detalhe da cobrança" };
export const dynamic = "force-dynamic";

interface LoadedInvoice {
  invoice: InvoiceFull | null;
  items: InvoiceItem[];
  activity: ActivityEntry[];
  payments: Payment[];
  links: PaymentLink[];
  customer: InvoiceCustomer | null;
  projects: ProjectOption[];
}

const EMPTY: LoadedInvoice = {
  invoice: null,
  items: [],
  activity: [],
  payments: [],
  links: [],
  customer: null,
  projects: [],
};

async function loadInvoice(id: string): Promise<LoadedInvoice> {
  return safeQuery(async () => {
    const { data: invoiceRow } = await db()
      .from("v_invoices_full")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const invoice = (invoiceRow as InvoiceFull | null) ?? null;
    if (!invoice) return EMPTY;

    const [items, activity, payments, links, customer, project] = await Promise.all([
      db().from("invoice_items").select("*").eq("invoice_id", id).order("position", {
        ascending: true,
      }),
      db()
        .from("activity_log")
        .select("*")
        .eq("entity_type", "invoice")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      db()
        .from("payments")
        .select("*")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false }),
      db()
        .from("payment_links")
        .select("*")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false }),
      db()
        .from("customers")
        .select(
          "id, name, legal_name, document, email, phone, zip_code, street, number, complement, district, city, state"
        )
        .eq("id", invoice.customer_id)
        .maybeSingle(),
      db()
        .from("projects")
        .select("id, name, code, customer_id")
        .eq("id", invoice.project_id)
        .maybeSingle(),
    ]);

    const projects: ProjectOption[] = project.data
      ? [
          {
            id: String(project.data.id),
            name: String(project.data.name),
            code: String(project.data.code),
            customer_id: String(project.data.customer_id),
            customer_name: invoice.customer_name,
          },
        ]
      : [];

    return {
      invoice,
      items: (items.data ?? []) as InvoiceItem[],
      activity: (activity.data ?? []) as ActivityEntry[],
      payments: (payments.data ?? []) as Payment[],
      links: (links.data ?? []) as PaymentLink[],
      customer: (customer.data as InvoiceCustomer | null) ?? null,
      projects,
    };
  }, EMPTY);
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const loaded = await loadInvoice(id);

  if (!loaded.invoice) notFound();

  const invoice = loaded.invoice;

  return (
    <>
      <PageHeader
        className="no-print"
        backHref="/cobrancas"
        backLabel="Voltar para cobranças"
        title={invoice.description}
        description={`${invoice.customer_name} · ${invoice.project_name}`}
        meta={
          <>
            <Badge tone="neutral" size="sm" className="font-mono">
              {invoice.code}
            </Badge>
            <Badge tone="info" size="sm">
              {formatCurrency(invoice.total)}
            </Badge>
          </>
        }
      />

      <InvoiceDetail
        invoice={invoice}
        items={loaded.items}
        activity={loaded.activity}
        payments={loaded.payments}
        links={loaded.links}
        customer={loaded.customer}
        projects={loaded.projects}
        appUrl={env.appUrl}
        canWrite={can(user.role, "billing:write")}
        mercadoPagoConfigured={isMercadoPagoConfigured()}
      />
    </>
  );
}
