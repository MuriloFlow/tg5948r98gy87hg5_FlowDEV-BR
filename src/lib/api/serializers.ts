import { env } from "@/lib/env";
import type {
  Invoice,
  InvoiceFull,
  Payment,
  PaymentLink,
  ProjectEntitlement,
} from "@/lib/types";

export function publicUrlForLink(token: string): string {
  return `${env.appUrl}/pay/${token}`;
}

export function serializeCharge(invoice: Invoice | InvoiceFull) {
  const full = invoice as InvoiceFull;
  return {
    object: "charge",
    id: invoice.id,
    code: invoice.code,
    status: invoice.status,
    description: invoice.description,
    reference: invoice.reference,
    amount: Number(invoice.total),
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount_amount),
    paid_amount: Number(invoice.paid_amount),
    balance_due: Number(invoice.total) - Number(invoice.paid_amount),
    currency: invoice.currency,
    due_date: invoice.due_date,
    expires_at: invoice.expires_at,
    paid_at: invoice.paid_at,
    is_mandatory: invoice.is_mandatory,
    blocks_at: invoice.blocks_at,
    payment_methods: invoice.payment_methods,
    max_installments: invoice.max_installments,
    project_id: invoice.project_id,
    customer_id: invoice.customer_id,
    subscription_id: invoice.subscription_id,
    metadata: invoice.metadata ?? {},
    checkout_url: full.checkout_url ?? null,
    payment_url: full.payment_link_token ? publicUrlForLink(full.payment_link_token) : null,
    created_at: invoice.created_at,
    updated_at: invoice.updated_at,
  };
}

export function serializePaymentLink(link: PaymentLink) {
  return {
    object: "payment_link",
    id: link.id,
    token: link.token,
    short_code: link.short_code,
    url: publicUrlForLink(link.token),
    checkout_url: link.checkout_url,
    title: link.title,
    description: link.description,
    amount: Number(link.amount),
    currency: link.currency,
    status: link.status,
    charge_id: link.invoice_id,
    project_id: link.project_id,
    customer_id: link.customer_id,
    payment_methods: link.payment_methods,
    max_installments: link.max_installments,
    expires_at: link.expires_at,
    max_uses: link.max_uses,
    uses: link.uses,
    view_count: link.view_count,
    paid_at: link.paid_at,
    created_at: link.created_at,
  };
}

export function serializePayment(payment: Payment) {
  return {
    object: "payment",
    id: payment.id,
    status: payment.status,
    method: payment.method,
    amount: Number(payment.amount),
    net_amount: payment.net_amount != null ? Number(payment.net_amount) : null,
    fee_amount: Number(payment.fee_amount),
    refunded_amount: Number(payment.refunded_amount),
    currency: payment.currency,
    installments: payment.installments,
    charge_id: payment.invoice_id,
    payment_link_id: payment.payment_link_id,
    project_id: payment.project_id,
    provider: payment.provider,
    provider_payment_id: payment.provider_payment_id,
    provider_status: payment.provider_status,
    provider_status_detail: payment.provider_status_detail,
    payer: {
      name: payment.payer_name,
      email: payment.payer_email,
      document: payment.payer_document,
    },
    card: payment.card_last4 ? { brand: payment.card_brand, last4: payment.card_last4 } : null,
    pix: payment.pix_qr_code
      ? {
          qr_code: payment.pix_qr_code,
          qr_code_base64: payment.pix_qr_code_base64,
          expires_at: payment.pix_expires_at,
        }
      : null,
    boleto_url: payment.boleto_url,
    approved_at: payment.approved_at,
    created_at: payment.created_at,
  };
}

/**
 * Contrato consumido pelas aplicações integradas para decidir se liberam ou
 * bloqueiam o acesso. Mantenha estável: é a superfície pública mais crítica.
 */
export function serializeEntitlement(
  entitlement: ProjectEntitlement,
  checkoutUrl: string | null,
  paymentUrl: string | null,
  options?: {
    includeCharge?: boolean;
    blockType?: "payment" | "manual" | "suspended" | null;
  }
) {
  const includeCharge = options?.includeCharge !== false && entitlement.blocking_invoice_id;

  return {
    object: "entitlement",
    project: {
      id: entitlement.project_id,
      code: entitlement.project_code,
      name: entitlement.project_name,
      slug: entitlement.slug,
      domain: entitlement.primary_domain,
    },
    status: entitlement.status,
    has_access: entitlement.has_access,
    blocked: entitlement.is_blocked || entitlement.has_access === false,
    blocked_reason: entitlement.blocked_reason,
    blocked_at: entitlement.blocked_at,
    block_type: options?.blockType ?? null,
    grace_days: entitlement.grace_days,
    customer: {
      id: entitlement.customer_id,
      name: entitlement.customer_name,
      email: entitlement.customer_email,
    },
    open_invoices: Number(entitlement.open_invoices ?? 0),
    open_amount: Number(entitlement.open_amount ?? 0),
    charge: includeCharge
      ? {
          id: entitlement.blocking_invoice_id,
          code: entitlement.blocking_invoice_code,
          description: entitlement.blocking_invoice_description,
          amount: Number(entitlement.blocking_invoice_total ?? 0),
          due_date: entitlement.blocking_invoice_due_date,
          checkout_url: checkoutUrl,
          payment_url: paymentUrl,
        }
      : null,
    checked_at: new Date().toISOString(),
  };
}

export function listEnvelope<T>(data: T[], total: number, limit: number, offset: number) {
  return {
    object: "list",
    data,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + data.length < total,
    },
  };
}
