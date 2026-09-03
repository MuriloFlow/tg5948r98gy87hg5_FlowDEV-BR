import "server-only";

import { db } from "./db";
import { syncPaymentsForLink } from "./payment-sync";
import type { PaymentMethod } from "./types";

export interface LinkPaymentStatus {
  paid: boolean;
  status: string;
  amount?: number;
  method?: PaymentMethod | null;
  paid_at?: string | null;
  invoice_code?: string | null;
  synced?: boolean;
  provider_status?: string | null;
  sync_errors?: string[];
}

const APPROVED_LOCAL = new Set(["APPROVED", "AUTHORIZED"]);

async function readApprovedPayment(linkId: string, fallbackAmount: number) {
  const { data: payments } = await db()
    .from("payments")
    .select("status, method, amount, approved_at, created_at, provider_status")
    .eq("payment_link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(5);

  const approved = (payments ?? []).find((p) => APPROVED_LOCAL.has(String(p.status)));
  if (!approved) return null;

  return {
    paid: true as const,
    status: String(approved.status),
    amount: Number(approved.amount ?? fallbackAmount),
    method: (approved.method as PaymentMethod | undefined) ?? null,
    paid_at: (approved.approved_at as string | null) ?? (approved.created_at as string | null),
    provider_status: (approved.provider_status as string | null) ?? null,
  };
}

/**
 * Resolve o status de pagamento de um link público.
 * Sempre tenta sincronizar com o Mercado Pago quando ainda não está pago.
 */
export async function resolveLinkPaymentStatus(
  token: string,
  options?: { forceSync?: boolean }
): Promise<LinkPaymentStatus | { error: string; status: number }> {
  const { data: link } = await db()
    .from("payment_links")
    .select("id, status, invoice_id, paid_at, amount")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { error: "not_found", status: 404 };

  let invoiceCode: string | null = null;

  if (link.invoice_id) {
    const { data: invoice } = await db()
      .from("invoices")
      .select("code, status, paid_at")
      .eq("id", link.invoice_id)
      .maybeSingle();

    invoiceCode = (invoice?.code as string | null) ?? null;

    if (invoice?.status === "PAID") {
      return {
        paid: true,
        status: "PAID",
        amount: Number(link.amount),
        paid_at: (link.paid_at as string | null) ?? (invoice.paid_at as string | null),
        invoice_code: invoiceCode,
      };
    }
  }

  if (link.status === "PAID") {
    return {
      paid: true,
      status: "PAID",
      amount: Number(link.amount),
      paid_at: link.paid_at as string | null,
      invoice_code: invoiceCode,
    };
  }

  let approved = await readApprovedPayment(link.id as string, Number(link.amount));
  if (approved) {
    return { ...approved, invoice_code: invoiceCode };
  }

  const shouldSync = options?.forceSync !== false;
  let syncMeta: {
    synced?: boolean;
    provider_status?: string | null;
    sync_errors?: string[];
  } = {};

  if (shouldSync) {
    const sync = await syncPaymentsForLink(link.id as string);
    syncMeta = {
      synced: sync.synced > 0,
      provider_status: sync.lastProviderStatus,
      sync_errors: sync.errors.length > 0 ? sync.errors : undefined,
    };

    if (sync.approved) {
      approved = await readApprovedPayment(link.id as string, Number(link.amount));
      if (approved) {
        return { ...approved, invoice_code: invoiceCode, synced: true };
      }
    }
  }

  const { data: refreshedLink } = await db()
    .from("payment_links")
    .select("status, paid_at")
    .eq("id", link.id)
    .maybeSingle();

  if (refreshedLink?.status === "PAID") {
    return {
      paid: true,
      status: "PAID",
      amount: Number(link.amount),
      paid_at: refreshedLink.paid_at as string | null,
      invoice_code: invoiceCode,
      synced: syncMeta.synced,
    };
  }

  approved = await readApprovedPayment(link.id as string, Number(link.amount));
  if (approved) {
    return { ...approved, invoice_code: invoiceCode, synced: syncMeta.synced ?? true };
  }

  const { data: latest } = await db()
    .from("payments")
    .select("status, provider_status")
    .eq("payment_link_id", link.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    paid: false,
    status: String(latest?.status ?? syncMeta.provider_status ?? "PENDING"),
    provider_status: (latest?.provider_status as string | null) ?? syncMeta.provider_status ?? null,
    invoice_code: invoiceCode,
    synced: syncMeta.synced,
    sync_errors: syncMeta.sync_errors,
  };
}
