import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env, isMercadoPagoConfigured } from "./env";
import type { PaymentMethod, PaymentStatus } from "./types";

const API = "https://api.mercadopago.com";

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

export class MercadoPagoNotConfiguredError extends Error {
  constructor() {
    super(
      "Mercado Pago não configurado. Defina MERCADOPAGO_ACCESS_TOKEN em Configurações → Gateways."
    );
    this.name = "MercadoPagoNotConfiguredError";
  }
}

async function mpFetch<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  if (!isMercadoPagoConfigured()) throw new MercadoPagoNotConfiguredError();

  const { idempotencyKey, ...rest } = init;
  const response = await fetch(`${API}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...(rest.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      (body as { message?: string })?.message ??
      `Mercado Pago respondeu ${response.status}`;
    throw new MercadoPagoError(message, response.status, body);
  }

  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/* -------------------------------------------------------------------------- */
/* URLs de retorno e de notificação                                            */
/* -------------------------------------------------------------------------- */

const PRIVATE_IPV4 =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * O Mercado Pago recusa `notification_url` que ele não consiga alcançar:
 * precisa ser HTTPS e apontar para um host público.
 */
export function isPublicHttpsUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") return false;
  if (host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return false;
  }
  if (PRIVATE_IPV4.test(host)) return false;
  // um host sem ponto nunca é resolvível pela internet
  return host.includes(".");
}

/** Aceita qualquer URL absoluta http(s) — serve para os redirecionamentos do pagador. */
export function isAbsoluteHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Endereço que o gateway usa para avisar sobre mudanças de status.
 * Devolve `null` quando não há URL pública — nesse caso o campo é omitido do
 * payload e a confirmação passa a depender do polling do checkout.
 */
export function resolveNotificationUrl(): string | null {
  const explicit = env.mercadoPagoNotificationUrl;
  if (explicit) return isPublicHttpsUrl(explicit) ? explicit : null;

  const fromApp = `${env.publicAppUrl}/api/webhooks/mercadopago`;
  return isPublicHttpsUrl(fromApp) ? fromApp : null;
}

/* -------------------------------------------------------------------------- */
/* Preferências (Checkout Pro)                                                */
/* -------------------------------------------------------------------------- */

export interface PreferenceInput {
  title: string;
  description?: string;
  amount: number;
  quantity?: number;
  externalReference: string;
  payerName?: string | null;
  payerEmail?: string | null;
  payerDocument?: string | null;
  methods: PaymentMethod[];
  maxInstallments: number;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  expiresAt?: string | null;
  statementDescriptor?: string;
  metadata?: Record<string, unknown>;
}

export interface PreferenceResult {
  id: string;
  initPoint: string;
  sandboxInitPoint: string | null;
}

function excludedPaymentTypes(methods: PaymentMethod[]) {
  const excluded: { id: string }[] = [];
  if (!methods.includes("CREDIT_CARD")) excluded.push({ id: "credit_card" });
  if (!methods.includes("DEBIT_CARD")) excluded.push({ id: "debit_card" });
  if (!methods.includes("BOLETO")) excluded.push({ id: "ticket" });
  if (!methods.includes("ACCOUNT_MONEY")) excluded.push({ id: "account_money" });
  return excluded;
}

export async function createPreference(input: PreferenceInput): Promise<PreferenceResult> {
  const nameParts = (input.payerName ?? "").trim().split(/\s+/);
  const notificationUrl = resolveNotificationUrl();

  const backUrls = {
    success: input.successUrl,
    failure: input.failureUrl,
    pending: input.pendingUrl,
  };
  // `auto_return` só é aceito junto de back_urls absolutas.
  const backUrlsValid = Object.values(backUrls).every(isAbsoluteHttpUrl);

  const payload = {
    items: [
      {
        id: input.externalReference,
        title: input.title.slice(0, 250),
        description: (input.description ?? input.title).slice(0, 250),
        quantity: input.quantity ?? 1,
        currency_id: "BRL",
        unit_price: Number(input.amount.toFixed(2)),
      },
    ],
    payer: input.payerEmail
      ? {
          email: input.payerEmail,
          name: nameParts[0] || undefined,
          surname: nameParts.slice(1).join(" ") || undefined,
          identification: input.payerDocument
            ? {
                type: input.payerDocument.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ",
                number: input.payerDocument.replace(/\D/g, ""),
              }
            : undefined,
        }
      : undefined,
    payment_methods: {
      excluded_payment_types: excludedPaymentTypes(input.methods),
      installments: Math.max(1, input.maxInstallments),
      default_installments: 1,
    },
    ...(backUrlsValid ? { back_urls: backUrls, auto_return: "approved" } : {}),
    external_reference: input.externalReference,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    statement_descriptor: (input.statementDescriptor ?? "FLOWDESK").slice(0, 22),
    expires: Boolean(input.expiresAt),
    expiration_date_to: input.expiresAt ?? undefined,
    metadata: input.metadata ?? {},
  };

  const result = await mpFetch<{
    id: string;
    init_point: string;
    sandbox_init_point?: string;
  }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(payload),
    idempotencyKey: `pref-${input.externalReference}-${randomUUID()}`,
  });

  return {
    id: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Pagamento PIX direto (QR Code dentro do nosso checkout)                    */
/* -------------------------------------------------------------------------- */

export interface PixPaymentInput {
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName?: string | null;
  payerDocument?: string | null;
  expiresInMinutes?: number;
}

export interface PixPaymentResult {
  id: string;
  status: string;
  statusDetail: string | null;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
  raw: unknown;
}

export async function createPixPayment(input: PixPaymentInput): Promise<PixPaymentResult> {
  const expiration = new Date(Date.now() + (input.expiresInMinutes ?? 60) * 60_000);
  const digits = (input.payerDocument ?? "").replace(/\D/g, "");
  const nameParts = (input.payerName ?? "Cliente").trim().split(/\s+/);
  const notificationUrl = resolveNotificationUrl();

  const linkId = input.externalReference.startsWith("link:")
    ? input.externalReference.slice(5)
    : null;

  const payload = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: input.description.slice(0, 250),
    payment_method_id: "pix",
    external_reference: input.externalReference,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    metadata: linkId ? { flowdesk_link_id: linkId } : {},
    date_of_expiration: expiration.toISOString(),
    payer: {
      email: input.payerEmail,
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(" ") || nameParts[0],
      ...(digits.length === 11 || digits.length === 14
        ? {
            identification: {
              type: digits.length === 11 ? "CPF" : "CNPJ",
              number: digits,
            },
          }
        : {}),
    },
  };

  const result = await mpFetch<{
    id: number;
    status: string;
    status_detail?: string;
    date_of_expiration?: string;
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
      };
    };
  }>("/v1/payments", {
    method: "POST",
    body: JSON.stringify(payload),
    idempotencyKey: `pix-${input.externalReference}-${randomUUID()}`,
  });

  const data = result.point_of_interaction?.transaction_data;

  return {
    id: String(result.id),
    status: result.status,
    statusDetail: result.status_detail ?? null,
    qrCode: data?.qr_code ?? null,
    qrCodeBase64: data?.qr_code_base64 ?? null,
    ticketUrl: data?.ticket_url ?? null,
    expiresAt: result.date_of_expiration ?? expiration.toISOString(),
    raw: result,
  };
}

/* -------------------------------------------------------------------------- */
/* Consulta e estorno                                                          */
/* -------------------------------------------------------------------------- */

export interface MpPayment {
  id: number;
  status: string;
  status_detail: string | null;
  transaction_amount: number;
  currency_id: string;
  installments: number;
  payment_method_id: string;
  payment_type_id: string;
  external_reference: string | null;
  date_approved: string | null;
  date_created: string;
  order?: { id?: string };
  payer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    identification?: { number?: string };
  };
  card?: { last_four_digits?: string; first_six_digits?: string };
  transaction_details?: { net_received_amount?: number };
  fee_details?: { amount?: number }[];
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
  transaction_amount_refunded?: number;
}

export async function getPayment(paymentId: string): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${paymentId}`);
}

/** Busca pagamentos pelo external_reference — fallback quando o ID local está desatualizado. */
export async function searchPaymentsByExternalReference(
  externalReference: string
): Promise<MpPayment[]> {
  const query = new URLSearchParams({
    sort: "date_created",
    criteria: "desc",
    external_reference: externalReference,
    limit: "10",
  });
  const result = await mpFetch<{ results?: MpPayment[] }>(
    `/v1/payments/search?${query.toString()}`
  );
  return result.results ?? [];
}

export async function getMerchantOrder(orderId: string): Promise<{
  payments?: { id: number; status: string }[];
  external_reference?: string;
}> {
  return mpFetch(`/merchant_orders/${orderId}`);
}

export async function refundPayment(
  paymentId: string,
  amount?: number
): Promise<{ id: number; status: string }> {
  return mpFetch(`/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    body: JSON.stringify(amount ? { amount: Number(amount.toFixed(2)) } : {}),
    idempotencyKey: `refund-${paymentId}-${randomUUID()}`,
  });
}

export async function cancelPayment(paymentId: string): Promise<void> {
  await mpFetch(`/v1/payments/${paymentId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/** Valida o token do painel do Mercado Pago sem persistir nada. */
export async function testCredentials(): Promise<{ ok: boolean; message: string }> {
  try {
    const me = await mpFetch<{ nickname?: string; email?: string; site_id?: string }>("/users/me");
    return {
      ok: true,
      message: `Conectado como ${me.nickname ?? me.email ?? "conta Mercado Pago"} (${me.site_id ?? "MLB"})`,
    };
  } catch (error) {
    if (error instanceof MercadoPagoNotConfiguredError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: (error as Error).message };
  }
}

/* -------------------------------------------------------------------------- */
/* Tradução de status e métodos                                                */
/* -------------------------------------------------------------------------- */

const STATUS_MAP: Record<string, PaymentStatus> = {
  pending: "PENDING",
  in_process: "IN_PROCESS",
  in_mediation: "IN_MEDIATION",
  authorized: "AUTHORIZED",
  approved: "APPROVED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "CHARGED_BACK",
};

export function mapStatus(status: string): PaymentStatus {
  return STATUS_MAP[status] ?? "PENDING";
}

export function mapMethod(paymentTypeId: string, paymentMethodId?: string): PaymentMethod {
  if (paymentMethodId === "pix") return "PIX";
  switch (paymentTypeId) {
    case "credit_card":
      return "CREDIT_CARD";
    case "debit_card":
      return "DEBIT_CARD";
    case "ticket":
      return "BOLETO";
    case "bank_transfer":
      return "PIX";
    case "account_money":
      return "ACCOUNT_MONEY";
    default:
      return "OTHER";
  }
}

/* -------------------------------------------------------------------------- */
/* Assinatura do webhook                                                       */
/* -------------------------------------------------------------------------- */

/**
 * O Mercado Pago envia `x-signature: ts=...,v1=...` e o manifesto assinado é
 * `id:{dataId};request-id:{xRequestId};ts:{ts};`.
 * Sem segredo configurado devolvemos `null` (não conseguimos afirmar nada).
 */
export function verifyWebhookSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): boolean | null {
  const secret = env.mercadoPagoWebhookSecret;
  if (!secret) return null;
  if (!params.signatureHeader || !params.dataId) return false;

  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((chunk) => {
      const [k, ...v] = chunk.trim().split("=");
      return [k, v.join("=")];
    })
  ) as { ts?: string; v1?: string };

  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.requestId ?? ""};ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}
