import "server-only";

import { db } from "./db";
import { ensurePaymentLinkFast } from "./billing";
import { publicUrlForLink, serializeEntitlement } from "./api/serializers";
import type { PaymentLink, ProjectEntitlement, ProjectStatus } from "./types";

const OPEN_STATUSES = ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"] as const;

function hasAccessStatus(status: ProjectStatus): boolean {
  return status === "ACTIVE" || status === "TRIAL";
}

/**
 * Cobrança + link de pagamento só quando o bloqueio é por inadimplência automática.
 * Bloqueio manual (blocked_by preenchido) ou SUSPENDED não exige pagamento na tela.
 */
export function shouldOfferPaymentCharge(input: {
  status: ProjectStatus;
  blockingInvoiceId: string | null;
  blockedBy: string | null;
}): boolean {
  if (!input.blockingInvoiceId) return false;
  if (input.status === "SUSPENDED" || input.status === "ARCHIVED") return false;
  if (input.status !== "BLOCKED_PAYMENT") return false;
  if (input.blockedBy) return false;
  return true;
}

async function sumOpenInvoices(projectId: string) {
  const { data } = await db()
    .from("invoices")
    .select("total, paid_amount, status")
    .eq("project_id", projectId)
    .in("status", [...OPEN_STATUSES]);

  const rows = data ?? [];
  return {
    count: rows.length,
    amount: rows.reduce((sum, row) => sum + Number(row.total) - Number(row.paid_amount ?? 0), 0),
  };
}

async function findBlockingInvoice(projectId: string) {
  const { data } = await db()
    .from("invoices")
    .select("id, code, total, due_date, description")
    .eq("project_id", projectId)
    .eq("is_mandatory", true)
    .in("status", [...OPEN_STATUSES, "EXPIRED"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data;
}

async function buildEntitlementFromTables(projectId: string): Promise<ProjectEntitlement | null> {
  const { data: project } = await db()
    .from("projects")
    .select(
      "id, code, name, slug, status, block_mode, blocked_at, blocked_reason, blocked_by, grace_days, primary_domain, customer_id"
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const { data: customer } = await db()
    .from("customers")
    .select("id, name, email")
    .eq("id", project.customer_id)
    .maybeSingle();

  if (!customer) return null;

  const blocking = await findBlockingInvoice(projectId);
  const open = await sumOpenInvoices(projectId);
  const status = project.status as ProjectStatus;

  return {
    project_id: project.id,
    project_code: project.code,
    project_name: project.name,
    slug: project.slug,
    status,
    block_mode: project.block_mode,
    blocked_at: project.blocked_at,
    blocked_reason: project.blocked_reason,
    grace_days: project.grace_days,
    primary_domain: project.primary_domain,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_email: customer.email,
    is_blocked: status === "BLOCKED_PAYMENT" || status === "SUSPENDED",
    has_access: hasAccessStatus(status),
    blocking_invoice_id: blocking?.id ?? null,
    blocking_invoice_code: blocking?.code ?? null,
    blocking_invoice_total: blocking ? Number(blocking.total) : null,
    blocking_invoice_due_date: blocking?.due_date ?? null,
    blocking_invoice_description: blocking?.description ?? null,
    open_invoices: open.count,
    open_amount: open.amount,
  };
}

export async function loadProjectEntitlement(projectId: string): Promise<{
  entitlement: ProjectEntitlement;
  blockedBy: string | null;
} | null> {
  const { data: fromView, error } = await db()
    .from("v_project_entitlement")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  let entitlement = (fromView as ProjectEntitlement | null) ?? null;

  if (!entitlement || error) {
    entitlement = await buildEntitlementFromTables(projectId);
  }

  if (!entitlement) return null;

  const { data: projectRow } = await db()
    .from("projects")
    .select("blocked_by")
    .eq("id", projectId)
    .maybeSingle();

  return {
    entitlement,
    blockedBy: (projectRow?.blocked_by as string | null) ?? null,
  };
}

async function resolveChargeUrls(invoiceId: string): Promise<{
  checkoutUrl: string | null;
  paymentUrl: string | null;
}> {
  const { data: existing } = await db()
    .from("payment_links")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const link = existing as PaymentLink | null;
  if (link) {
    return {
      checkoutUrl: link.checkout_url,
      paymentUrl: publicUrlForLink(link.token),
    };
  }

  try {
    const created = await ensurePaymentLinkFast(invoiceId, { createdVia: "API" });
    return {
      checkoutUrl: created.checkout_url,
      paymentUrl: publicUrlForLink(created.token),
    };
  } catch (error) {
    console.warn("[flowdesk] link rápido não provisionado:", (error as Error).message);
    return { checkoutUrl: null, paymentUrl: null };
  }
}

export async function buildEntitlementResponse(projectId: string) {
  const loaded = await loadProjectEntitlement(projectId);
  if (!loaded) return null;

  const { entitlement, blockedBy } = loaded;

  let checkoutUrl: string | null = null;
  let paymentUrl: string | null = null;

  const offerPayment = shouldOfferPaymentCharge({
    status: entitlement.status,
    blockingInvoiceId: entitlement.blocking_invoice_id,
    blockedBy,
  });

  if (offerPayment && entitlement.blocking_invoice_id) {
    const urls = await resolveChargeUrls(entitlement.blocking_invoice_id);
    checkoutUrl = urls.checkoutUrl;
    paymentUrl = urls.paymentUrl;
  }

  return serializeEntitlement(entitlement, checkoutUrl, paymentUrl, {
    includeCharge: offerPayment,
    blockType: offerPayment
      ? "payment"
      : entitlement.status === "SUSPENDED"
        ? "suspended"
        : blockedBy
          ? "manual"
          : null,
  });
}
