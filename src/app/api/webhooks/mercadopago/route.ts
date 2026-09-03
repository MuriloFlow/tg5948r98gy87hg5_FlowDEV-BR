import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/mercadopago";
import { syncMercadoPagoPayment, syncMerchantOrder } from "@/lib/payment-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receptor de notificações do Mercado Pago.
 *
 * Sempre respondemos 200 rapidamente: se algo falhar, o webhook fica gravado em
 * `gateway_webhooks` com `processed = false` e é reprocessado pelo cron ou
 * manualmente na tela de Gateways. Devolver erro faria o Mercado Pago
 * reenviar por horas e ainda assim perderíamos o payload.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let payload: {
    type?: string;
    topic?: string;
    action?: string;
    data?: { id?: string | number };
    resource?: string;
  } = {};

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  const params = request.nextUrl.searchParams;
  const type = payload.type ?? payload.topic ?? params.get("type") ?? params.get("topic") ?? null;
  const dataId =
    (payload.data?.id != null ? String(payload.data.id) : null) ??
    params.get("data.id") ??
    params.get("id") ??
    null;

  const signatureHeader = request.headers.get("x-signature");
  const requestIdHeader = request.headers.get("x-request-id");
  const signatureValid = verifyWebhookSignature({
    signatureHeader,
    requestId: requestIdHeader,
    dataId,
  });

  let recordId: string | null = null;

  try {
    const { data } = await db()
      .from("gateway_webhooks")
      .insert({
        provider: "mercadopago",
        event_type: payload.action ?? type,
        external_id: dataId,
        signature: signatureHeader,
        signature_valid: signatureValid,
        headers: Object.fromEntries(request.headers.entries()),
        body: payload as Record<string, unknown>,
      })
      .select("id")
      .single();
    recordId = data?.id ?? null;
  } catch (error) {
    console.error("[flowdesk] não foi possível registrar o webhook:", (error as Error).message);
  }

  // Assinatura configurada e inválida => descarta (possível tentativa de forjar)
  if (signatureValid === false) {
    if (recordId) {
      await db()
        .from("gateway_webhooks")
        .update({ process_error: "Assinatura inválida — notificação descartada" })
        .eq("id", recordId);
    }
    return NextResponse.json({ received: true, ignored: "invalid_signature" }, { status: 200 });
  }

  try {
    if (!dataId) {
      throw new Error("Notificação sem identificador de recurso");
    }

    if (type === "payment" || payload.action?.startsWith("payment.")) {
      await syncMercadoPagoPayment(dataId);
    } else if (type === "merchant_order") {
      await syncMerchantOrder(dataId);
    } else {
      // tópicos que não afetam cobranças (ex.: plan, subscription do MP)
      if (recordId) {
        await db()
          .from("gateway_webhooks")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            process_error: `Tópico ignorado: ${type ?? "desconhecido"}`,
          })
          .eq("id", recordId);
      }
      return NextResponse.json({ received: true, ignored: type }, { status: 200 });
    }

    if (recordId) {
      await db()
        .from("gateway_webhooks")
        .update({ processed: true, processed_at: new Date().toISOString(), process_error: null })
        .eq("id", recordId);
    }

    return NextResponse.json({ received: true, processed: true }, { status: 200 });
  } catch (error) {
    const message = (error as Error).message;
    console.error("[flowdesk] falha ao processar webhook do Mercado Pago:", message);

    if (recordId) {
      await db()
        .from("gateway_webhooks")
        .update({ process_error: message })
        .eq("id", recordId);
    }

    // 200 de propósito: o reprocessamento é nosso, não do gateway.
    return NextResponse.json({ received: true, processed: false, error: message }, { status: 200 });
  }
}

/** O Mercado Pago valida a URL com um GET antes de ativar o webhook. */
export async function GET() {
  return NextResponse.json({
    service: "flowdesk-webhooks",
    provider: "mercadopago",
    status: "ready",
  });
}
