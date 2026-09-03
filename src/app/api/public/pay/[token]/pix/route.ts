import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import * as mp from "@/lib/mercadopago";
import { flushEventsFor } from "@/lib/billing";
import type { Customer, PaymentLink } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ip(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * POST /api/public/pay/{token}/pix
 * Rota pública (sem chave de API) usada pelo checkout hospedado. Protegida por
 * rate limit por IP e pela validade do token do link.
 */
export async function POST(
  request: NextRequest,
  segment: { params: Promise<{ token: string }> }
) {
  const { token } = await segment.params;
  const clientIp = ip(request);

  try {
    const { data: hits } = await db().rpc("bump_rate_limit", {
      p_bucket: `pix:${clientIp ?? token}`,
      p_window_seconds: 60,
    });
    if (Number(hits ?? 0) > 8) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
        { status: 429 }
      );
    }

    const { data } = await db()
      .from("payment_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!data) return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });

    const link = data as PaymentLink;

    if (link.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Este link não está mais disponível para pagamento." },
        { status: 409 }
      );
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: "Este link de pagamento expirou." }, { status: 409 });
    }
    if (!link.payment_methods.includes("PIX")) {
      return NextResponse.json(
        { error: "Pix não está habilitado para esta cobrança." },
        { status: 409 }
      );
    }

    // reaproveita um Pix ainda válido em vez de gerar outro
    const { data: existing } = await db()
      .from("payments")
      .select("id, provider_payment_id, pix_qr_code, pix_qr_code_base64, pix_expires_at, status")
      .eq("payment_link_id", link.id)
      .eq("method", "PIX")
      .in("status", ["PENDING", "IN_PROCESS"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existing?.pix_qr_code &&
      existing.pix_expires_at &&
      new Date(existing.pix_expires_at) > new Date()
    ) {
      return NextResponse.json({
        payment_id: existing.id,
        qr_code: existing.pix_qr_code,
        qr_code_base64: existing.pix_qr_code_base64,
        expires_at: existing.pix_expires_at,
        reused: true,
      });
    }

    const { data: customerRow } = await db()
      .from("customers")
      .select("*")
      .eq("id", link.customer_id)
      .maybeSingle();
    const customer = customerRow as Customer | null;

    const pix = await mp.createPixPayment({
      amount: Number(link.amount),
      description: link.title,
      externalReference: `link:${link.id}`,
      payerEmail: customer?.email ?? "pagador@flowdesk.app",
      payerName: customer?.name ?? "Cliente",
      payerDocument: customer?.document ?? null,
      expiresInMinutes: 60,
    });

    const { data: payment } = await db()
      .from("payments")
      .upsert(
        {
          invoice_id: link.invoice_id,
          payment_link_id: link.id,
          project_id: link.project_id,
          customer_id: link.customer_id,
          provider: "mercadopago",
          provider_payment_id: pix.id,
          provider_status: pix.status,
          provider_status_detail: pix.statusDetail,
          method: "PIX",
          status: mp.mapStatus(pix.status),
          amount: Number(link.amount),
          currency: link.currency,
          payer_name: customer?.name ?? null,
          payer_email: customer?.email ?? null,
          payer_document: customer?.document ?? null,
          pix_qr_code: pix.qrCode,
          pix_qr_code_base64: pix.qrCodeBase64,
          pix_expires_at: pix.expiresAt,
          boleto_url: pix.ticketUrl,
          ip: clientIp,
          user_agent: request.headers.get("user-agent"),
          raw_payload: pix.raw as Record<string, unknown>,
          metadata: { flowdesk_link_id: link.id },
        },
        { onConflict: "provider,provider_payment_id" }
      )
      .select("id")
      .single();

    void flushEventsFor(link.project_id);

    return NextResponse.json({
      payment_id: payment?.id ?? pix.id,
      qr_code: pix.qrCode,
      qr_code_base64: pix.qrCodeBase64,
      expires_at: pix.expiresAt,
      reused: false,
    });
  } catch (error) {
    const message =
      error instanceof mp.MercadoPagoNotConfiguredError
        ? "O meio de pagamento ainda não foi configurado. Fale com o responsável pela cobrança."
        : (error as Error).message;

    console.error("[flowdesk] falha ao gerar Pix:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
