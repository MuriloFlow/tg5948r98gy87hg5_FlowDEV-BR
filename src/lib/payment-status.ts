import "server-only";

import { db } from "./db";
import { syncLinkIfDue } from "./payment-watch";
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
  /** Indica se o backend consultou o Mercado Pago nesta resposta. */
  provider_checked?: boolean;
}

export type PaymentSyncMode = "none" | "if-due" | "force";

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

async function readPendingMeta(linkId: string) {
  const { data: latest } = await db()
    .from("payments")
    .select("status, provider_status")
    .eq("payment_link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    status: String(latest?.status ?? "PENDING"),
    provider_status: (latest?.provider_status as string | null) ?? null,
  };
}

/**
 * Lê o status apenas do banco local — rápido e barato para polling do checkout.
 */
export async function readLinkPaymentStatus(
  token: string
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

  const approved = await readApprovedPayment(link.id as string, Number(link.amount));
  if (approved) {
    return { ...approved, invoice_code: invoiceCode };
  }

  const pending = await readPendingMeta(link.id as string);
  return {
    paid: false,
    status: pending.status,
    provider_status: pending.provider_status,
    invoice_code: invoiceCode,
  };
}

/**
 * Resolve o status de pagamento de um link público.
 * A sincronização com o Mercado Pago é controlada pelo backend (`sync` mode).
 */
export async function resolveLinkPaymentStatus(
  token: string,
  options?: { sync?: PaymentSyncMode }
): Promise<LinkPaymentStatus | { error: string; status: number }> {
  const syncMode = options?.sync ?? "none";

  const { data: link } = await db()
    .from("payment_links")
    .select("id, status, invoice_id, paid_at, amount")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { error: "not_found", status: 404 };

  const local = await readLinkPaymentStatus(token);
  if ("error" in local) return local;
  if (local.paid || syncMode === "none") {
    return local;
  }

  const { ran, result } = await syncLinkIfDue(link.id as string, syncMode === "force");
  if (!ran || !result) {
    return { ...local, provider_checked: false };
  }

  const afterSync = await readLinkPaymentStatus(token);
  if ("error" in afterSync) return afterSync;

  return {
    ...afterSync,
    synced: result.synced > 0,
    provider_status: afterSync.provider_status ?? result.lastProviderStatus,
    sync_errors: result.errors.length > 0 ? result.errors : undefined,
    provider_checked: true,
  };
}
