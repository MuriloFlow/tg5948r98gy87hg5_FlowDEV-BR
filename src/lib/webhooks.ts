import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import type { WebhookEndpoint } from "./types";

const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 1440];
const TIMEOUT_MS = 10_000;

/**
 * Assinatura no formato `t=<unix>,v1=<hex>`.
 * O manifesto assinado é `<timestamp>.<corpo bruto>` — o cliente deve recalcular
 * usando exatamente o corpo recebido, sem reserializar o JSON.
 */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
  toleranceSeconds = 300
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

interface EventRow {
  id: string;
  type: string;
  project_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

function buildBody(event: EventRow): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    api_version: "2026-01-01",
    created_at: event.created_at,
    project_id: event.project_id,
    data: {
      object_type: event.resource_type,
      object_id: event.resource_id,
      ...event.payload,
    },
  });
}

async function postWithTimeout(url: string, body: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text().catch(() => "");
    return { status: response.status, body: text.slice(0, 4000) };
  } finally {
    clearTimeout(timer);
  }
}

async function deliverToEndpoint(
  endpoint: WebhookEndpoint,
  event: EventRow,
  attempt: number
): Promise<boolean> {
  const body = buildBody(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(endpoint.secret, timestamp, body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "FlowDesk-Webhooks/1.0",
    "X-FlowDesk-Signature": signature,
    "X-FlowDesk-Event": event.type,
    "X-FlowDesk-Event-Id": event.id,
    "X-FlowDesk-Delivery-Attempt": String(attempt),
  };

  const started = Date.now();
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const result = await postWithTimeout(endpoint.url, body, headers);
    responseStatus = result.status;
    responseBody = result.body;
  } catch (error) {
    errorMessage = (error as Error).name === "AbortError"
      ? "Timeout de 10s excedido"
      : (error as Error).message;
  }

  const duration = Date.now() - started;
  const success = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const willRetry = !success && attempt < MAX_ATTEMPTS;

  await db().from("webhook_deliveries").insert({
    endpoint_id: endpoint.id,
    event_id: event.id,
    event_type: event.type,
    attempt,
    status: success ? "SUCCESS" : willRetry ? "RETRYING" : "FAILED",
    request_url: endpoint.url,
    request_body: body,
    request_headers: headers,
    response_status: responseStatus,
    response_body: responseBody,
    error_message: errorMessage,
    duration_ms: duration,
    delivered_at: success ? new Date().toISOString() : null,
    next_retry_at: willRetry
      ? new Date(Date.now() + BACKOFF_MINUTES[attempt - 1] * 60_000).toISOString()
      : null,
  });

  await db()
    .from("webhook_endpoints")
    .update(
      success
        ? {
            last_success_at: new Date().toISOString(),
            consecutive_failures: 0,
            total_deliveries: endpoint.total_deliveries + 1,
          }
        : {
            last_failure_at: new Date().toISOString(),
            consecutive_failures: endpoint.consecutive_failures + 1,
            total_deliveries: endpoint.total_deliveries + 1,
            // desativa após muitas falhas seguidas para não martelar o endpoint
            ...(endpoint.consecutive_failures + 1 >= 25 ? { status: "DISABLED" } : {}),
          }
    )
    .eq("id", endpoint.id);

  return success;
}

/** Entrega um evento para todos os endpoints ativos que o assinam. */
export async function dispatchEvent(eventId: string): Promise<{ delivered: number; failed: number }> {
  const { data: event } = await db()
    .from("events")
    .select("id, type, project_id, resource_type, resource_id, payload, created_at")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { delivered: 0, failed: 0 };

  const { data: endpoints } = await db()
    .from("webhook_endpoints")
    .select("*")
    .eq("project_id", event.project_id)
    .eq("status", "ACTIVE")
    .contains("events", [event.type]);

  let delivered = 0;
  let failed = 0;

  for (const endpoint of (endpoints ?? []) as WebhookEndpoint[]) {
    const ok = await deliverToEndpoint(endpoint, event as EventRow, 1);
    if (ok) delivered++;
    else failed++;
  }

  await db().from("events").update({ delivered: true }).eq("id", eventId);
  return { delivered, failed };
}

/** Processa a fila de eventos ainda não entregues. Chamado pelo cron. */
export async function dispatchPendingEvents(limit = 100) {
  const { data: events } = await db()
    .from("events")
    .select("id")
    .eq("delivered", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  let delivered = 0;
  let failed = 0;

  for (const event of events ?? []) {
    const result = await dispatchEvent(event.id);
    delivered += result.delivered;
    failed += result.failed;
  }

  return { processed: events?.length ?? 0, delivered, failed };
}

/** Reprocessa entregas que falharam e já passaram do backoff. */
export async function retryFailedDeliveries(limit = 50) {
  const { data: deliveries } = await db()
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_id, attempt")
    .in("status", ["RETRYING", "FAILED"])
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  let retried = 0;

  for (const delivery of deliveries ?? []) {
    if (delivery.attempt >= MAX_ATTEMPTS) continue;

    const [{ data: endpoint }, { data: event }] = await Promise.all([
      db().from("webhook_endpoints").select("*").eq("id", delivery.endpoint_id).maybeSingle(),
      db()
        .from("events")
        .select("id, type, project_id, resource_type, resource_id, payload, created_at")
        .eq("id", delivery.event_id)
        .maybeSingle(),
    ]);

    if (!endpoint || !event || endpoint.status !== "ACTIVE") continue;

    await deliverToEndpoint(endpoint as WebhookEndpoint, event as EventRow, delivery.attempt + 1);
    // a tentativa anterior deixa de estar na fila
    await db().from("webhook_deliveries").update({ status: "DROPPED", next_retry_at: null }).eq("id", delivery.id);
    retried++;
  }

  return { retried };
}

/** Reenvio manual disparado pelo painel. */
export async function replayDelivery(deliveryId: string) {
  const { data: delivery } = await db()
    .from("webhook_deliveries")
    .select("endpoint_id, event_id, attempt")
    .eq("id", deliveryId)
    .maybeSingle();

  if (!delivery) throw new Error("Entrega não encontrada");

  const [{ data: endpoint }, { data: event }] = await Promise.all([
    db().from("webhook_endpoints").select("*").eq("id", delivery.endpoint_id).maybeSingle(),
    db()
      .from("events")
      .select("id, type, project_id, resource_type, resource_id, payload, created_at")
      .eq("id", delivery.event_id)
      .maybeSingle(),
  ]);

  if (!endpoint || !event) throw new Error("Endpoint ou evento não encontrado");

  return deliverToEndpoint(endpoint as WebhookEndpoint, event as EventRow, delivery.attempt + 1);
}
