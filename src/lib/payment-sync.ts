import "server-only";
import { db } from "./db";
import * as mp from "./mercadopago";
import { flushEventsFor } from "./billing";
import type { PaymentLink } from "./types";

export interface SyncHint {
  linkId?: string;
}

const APPROVED_REMOTE = new Set(["approved", "authorized"]);

function linkIdFromReference(externalReference: string | null): string | null {
  if (!externalReference?.startsWith("link:")) return null;
  return externalReference.slice(5) || null;
}

/**
 * Descobre a qual link pertence um pagamento do Mercado Pago.
 * Tenta metadata, external_reference, hint explícito e registro local existente.
 */
async function resolveLink(
  remote: mp.MpPayment,
  providerPaymentId: string,
  hint?: SyncHint
): Promise<PaymentLink | null> {
  const metadata = (remote as unknown as { metadata?: Record<string, unknown> }).metadata;
  const candidates = [
    hint?.linkId,
    metadata?.flowdesk_link_id as string | undefined,
    linkIdFromReference(remote.external_reference),
  ].filter(Boolean) as string[];

  for (const linkId of candidates) {
    const { data } = await db()
      .from("payment_links")
      .select("*")
      .eq("id", linkId)
      .maybeSingle();
    if (data) return data as PaymentLink;
  }

  const { data: existing } = await db()
    .from("payments")
    .select("payment_link_id")
    .eq("provider", "mercadopago")
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();

  if (existing?.payment_link_id) {
    const { data } = await db()
      .from("payment_links")
      .select("*")
      .eq("id", existing.payment_link_id)
      .maybeSingle();
    if (data) return data as PaymentLink;
  }

  return null;
}

/** Recalcula paid_amount e status da fatura após confirmação (fallback explícito). */
async function recalculateInvoice(invoiceId: string): Promise<void> {
  const [{ data: invoice }, { data: payments }] = await Promise.all([
    db().from("invoices").select("total, status").eq("id", invoiceId).maybeSingle(),
    db()
      .from("payments")
      .select("amount, refunded_amount")
      .eq("invoice_id", invoiceId)
      .in("status", ["APPROVED", "AUTHORIZED"]),
  ]);

  if (!invoice) return;

  const paid = (payments ?? []).reduce(
    (sum, row) => sum + Number(row.amount) - Number(row.refunded_amount ?? 0),
    0
  );
  const total = Number(invoice.total);

  const updates: Record<string, unknown> = {
    paid_amount: paid,
    updated_at: new Date().toISOString(),
  };

  if (paid >= total && total > 0 && !["CANCELED", "REFUNDED"].includes(String(invoice.status))) {
    updates.status = "PAID";
    updates.paid_at = new Date().toISOString();
  } else if (paid > 0 && paid < total && !["CANCELED", "REFUNDED", "EXPIRED"].includes(String(invoice.status))) {
    updates.status = "PARTIALLY_PAID";
  }

  await db().from("invoices").update(updates).eq("id", invoiceId);
}

async function finalizeApprovedLink(
  link: PaymentLink,
  approvedAt: string | null
): Promise<void> {
  const paidAt = approvedAt ?? new Date().toISOString();

  await db()
    .from("payment_links")
    .update({
      status: "PAID",
      paid_at: paidAt,
      uses: link.uses + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", link.id);

  if (link.invoice_id) {
    await recalculateInvoice(link.invoice_id);
  }
}

export interface SyncResult {
  status: "synced" | "ignored";
  paymentId?: string;
  invoiceId?: string | null;
  providerStatus?: string;
  reason?: string;
}

/**
 * Busca o pagamento no Mercado Pago e reflete o estado no banco.
 * É idempotente: pode ser chamado quantas vezes o gateway reenviar o webhook.
 */
export async function syncMercadoPagoPayment(
  providerPaymentId: string,
  hint?: SyncHint
): Promise<SyncResult> {
  const remote = await mp.getPayment(providerPaymentId);
  const link = await resolveLink(remote, providerPaymentId, hint);

  if (!link) {
    return {
      status: "ignored",
      reason: `Pagamento ${providerPaymentId} sem link correspondente no FlowDesk`,
      providerStatus: remote.status,
    };
  }

  const status = mp.mapStatus(remote.status);
  const method = mp.mapMethod(remote.payment_type_id, remote.payment_method_id);
  const pix = remote.point_of_interaction?.transaction_data;
  const fees = (remote.fee_details ?? []).reduce((sum, f) => sum + (f.amount ?? 0), 0);

  const record = {
    invoice_id: link.invoice_id,
    payment_link_id: link.id,
    project_id: link.project_id,
    customer_id: link.customer_id,
    provider: "mercadopago",
    provider_payment_id: String(remote.id),
    provider_order_id: remote.order?.id ? String(remote.order.id) : null,
    provider_status: remote.status,
    provider_status_detail: remote.status_detail,
    method,
    status,
    amount: remote.transaction_amount,
    net_amount: remote.transaction_details?.net_received_amount ?? null,
    fee_amount: fees,
    refunded_amount: remote.transaction_amount_refunded ?? 0,
    currency: remote.currency_id ?? "BRL",
    installments: remote.installments ?? 1,
    payer_name: [remote.payer?.first_name, remote.payer?.last_name].filter(Boolean).join(" ") || null,
    payer_email: remote.payer?.email ?? null,
    payer_document: remote.payer?.identification?.number ?? null,
    pix_qr_code: pix?.qr_code ?? null,
    pix_qr_code_base64: pix?.qr_code_base64 ?? null,
    boleto_url: pix?.ticket_url ?? null,
    card_brand: remote.payment_method_id ?? null,
    card_last4: remote.card?.last_four_digits ?? null,
    approved_at: remote.date_approved,
    raw_payload: remote as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await db()
    .from("payments")
    .upsert(record, { onConflict: "provider,provider_payment_id" })
    .select("id, invoice_id, status")
    .single();

  if (error) throw new Error(`Falha ao gravar pagamento: ${error.message}`);

  if (status === "APPROVED" || status === "AUTHORIZED") {
    await finalizeApprovedLink(link, remote.date_approved);
  }

  await flushEventsFor(link.project_id);

  return {
    status: "synced",
    paymentId: saved.id,
    invoiceId: saved.invoice_id,
    providerStatus: remote.status,
  };
}

/**
 * Sincroniza todos os pagamentos pendentes de um link e busca no MP por
 * external_reference quando o polling local não encontra confirmação.
 */
export async function syncPaymentsForLink(linkId: string): Promise<{
  synced: number;
  approved: boolean;
  lastProviderStatus: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  let synced = 0;
  let approved = false;
  let lastProviderStatus: string | null = null;

  const { data: pendingPayments } = await db()
    .from("payments")
    .select("provider_payment_id")
    .eq("payment_link_id", linkId)
    .in("status", ["PENDING", "IN_PROCESS"])
    .not("provider_payment_id", "is", null)
    .order("created_at", { ascending: false });

  for (const payment of pendingPayments ?? []) {
    try {
      const result = await syncMercadoPagoPayment(String(payment.provider_payment_id), { linkId });
      synced++;
      lastProviderStatus = result.providerStatus ?? lastProviderStatus;
      if (result.providerStatus && APPROVED_REMOTE.has(result.providerStatus)) {
        approved = true;
        break;
      }
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  if (!approved) {
    try {
      const remotePayments = await mp.searchPaymentsByExternalReference(`link:${linkId}`);
      for (const remote of remotePayments) {
        lastProviderStatus = remote.status ?? lastProviderStatus;
        if (!APPROVED_REMOTE.has(remote.status)) continue;

        try {
          const result = await syncMercadoPagoPayment(String(remote.id), { linkId });
          synced++;
          if (result.status === "synced") {
            approved = true;
            break;
          }
        } catch (err) {
          errors.push((err as Error).message);
        }
      }
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  return { synced, approved, lastProviderStatus, errors };
}

/**
 * Um merchant_order pode agrupar várias tentativas de pagamento;
 * sincronizamos todas para não perder nenhuma confirmação.
 */
export async function syncMerchantOrder(orderId: string): Promise<SyncResult[]> {
  const order = await mp.getMerchantOrder(orderId);
  const results: SyncResult[] = [];

  for (const payment of order.payments ?? []) {
    results.push(await syncMercadoPagoPayment(String(payment.id)));
  }

  return results;
}

/**
 * O Mercado Pago devolve o pagador para as `back_urls` com os identificadores da
 * transação. Quando não há webhook público (desenvolvimento, ou gateway sem
 * `notification_url`), esse retorno é o que fecha o ciclo da cobrança.
 */
export async function syncFromCheckoutReturn(
  params: Record<string, string | string[] | undefined>
): Promise<void> {
  const pick = (key: string) => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value && value !== "null" ? value : null;
  };

  const paymentId = pick("payment_id") ?? pick("collection_id");
  const orderId = pick("merchant_order_id");

  try {
    if (paymentId) await syncMercadoPagoPayment(paymentId);
    else if (orderId) await syncMerchantOrder(orderId);
  } catch (error) {
    console.warn(
      "[flowdesk] retorno do checkout não sincronizado:",
      (error as Error).message
    );
  }
}

/** Reconciliação: reprocessa webhooks que falharam. */
export async function reprocessFailedGatewayWebhooks(limit = 50) {
  const { data: rows } = await db()
    .from("gateway_webhooks")
    .select("id, body, event_type, external_id")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    try {
      if (row.external_id) {
        await syncMercadoPagoPayment(row.external_id);
      }
      await db()
        .from("gateway_webhooks")
        .update({ processed: true, processed_at: new Date().toISOString(), process_error: null })
        .eq("id", row.id);
      processed++;
    } catch (error) {
      await db()
        .from("gateway_webhooks")
        .update({ process_error: (error as Error).message })
        .eq("id", row.id);
      failed++;
    }
  }

  return { processed, failed };
}
