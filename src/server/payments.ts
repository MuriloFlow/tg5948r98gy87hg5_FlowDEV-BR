"use server";

import { revalidatePath } from "next/cache";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit, notify } from "@/lib/audit";
import { flushEventsFor } from "@/lib/billing";
import * as mp from "@/lib/mercadopago";
import { MercadoPagoNotConfiguredError } from "@/lib/mercadopago";
import { syncMercadoPagoPayment } from "@/lib/payment-sync";
import { fail, ok, run, type ActionResult } from "./action-utils";
import type { Payment } from "@/lib/types";

interface PaymentRow extends Payment {
  provider_order_id: string | null;
  refunded_at: string | null;
}

function revalidatePayments(invoiceId?: string | null) {
  revalidatePath("/pagamentos");
  revalidatePath("/reembolsos");
  revalidatePath("/cobrancas");
  if (invoiceId) revalidatePath(`/cobrancas/${invoiceId}`);
  revalidatePath("/dashboard");
}

/* -------------------------------------------------------------------------- */
/* Estorno                                                                     */
/* -------------------------------------------------------------------------- */

export async function refundPaymentAction(input: {
  paymentId: string;
  amount?: number | null;
  reason?: string | null;
}): Promise<ActionResult<{ refundId: string; partial: boolean }>> {
  return run(async () => {
    const user = await assertPermission("payments:refund");

    const payment = await must<PaymentRow>(
      db().from("payments").select("*").eq("id", input.paymentId).single()
    );

    if (payment.status !== "APPROVED" && payment.status !== "AUTHORIZED") {
      return fail("Só é possível estornar pagamentos aprovados.");
    }

    const available = Number(payment.amount) - Number(payment.refunded_amount ?? 0);
    if (available <= 0) return fail("Este pagamento já foi totalmente estornado.");

    const amount = input.amount && input.amount > 0 ? Number(input.amount) : available;
    if (amount > available + 0.01) {
      return fail(
        `O valor máximo disponível para estorno é de ${available.toFixed(2)}.`
      );
    }

    const partial = amount < available - 0.01;
    const isGateway = payment.provider === "mercadopago" && Boolean(payment.provider_payment_id);

    let providerRefundId: string | null = null;
    let providerStatus = "APPROVED";
    let rawPayload: Record<string, unknown> = { manual: !isGateway };

    if (isGateway) {
      try {
        const refund = await mp.refundPayment(
          String(payment.provider_payment_id),
          partial ? amount : undefined
        );
        providerRefundId = String(refund.id);
        providerStatus = String(refund.status ?? "APPROVED").toUpperCase();
        rawPayload = refund as unknown as Record<string, unknown>;
      } catch (error) {
        if (error instanceof MercadoPagoNotConfiguredError) {
          return fail(
            "Mercado Pago não configurado: o estorno precisa ser feito no gateway. Configure o token em Configurações → Gateways e tente novamente."
          );
        }
        return fail(`O Mercado Pago recusou o estorno: ${(error as Error).message}`);
      }
    }

    const refund = await must<{ id: string }>(
      db()
        .from("refunds")
        .insert({
          payment_id: payment.id,
          invoice_id: payment.invoice_id,
          amount,
          reason: input.reason?.trim() || null,
          provider_refund_id: providerRefundId,
          status: providerStatus,
          raw_payload: rawPayload,
          created_by: user.id,
        })
        .select("id")
        .single()
    );

    const refundedTotal = Number(payment.refunded_amount ?? 0) + amount;
    const fullyRefunded = refundedTotal >= Number(payment.amount) - 0.01;

    await db()
      .from("payments")
      .update({
        refunded_amount: refundedTotal,
        status: fullyRefunded ? "REFUNDED" : payment.status,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    if (fullyRefunded && payment.invoice_id) {
      await db()
        .from("invoices")
        .update({ status: "REFUNDED" })
        .eq("id", payment.invoice_id);
    }

    await audit({
      action: "payment.refunded",
      entityType: "payment",
      entityId: payment.id,
      entityLabel: payment.provider_payment_id,
      before: { refunded_amount: payment.refunded_amount, status: payment.status },
      after: { refunded_amount: refundedTotal, partial, amount },
      actorId: user.id,
      actorLabel: user.name,
    });

    await notify({
      title: partial ? "Estorno parcial registrado" : "Estorno total registrado",
      body: `${amount.toFixed(2)} devolvido${input.reason ? ` — ${input.reason}` : ""}.`,
      severity: "WARNING",
      category: "billing",
      entityType: "payment",
      entityId: payment.id,
      actionUrl: "/reembolsos",
    });

    await flushEventsFor(payment.project_id);
    revalidatePayments(payment.invoice_id);

    return ok(
      { refundId: refund.id, partial },
      partial
        ? "Estorno parcial registrado."
        : "Estorno total registrado. A cobrança foi marcada como estornada."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Sincronização com o gateway                                                 */
/* -------------------------------------------------------------------------- */

export async function syncPaymentAction(paymentId: string): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("billing:write");

    const payment = await must<PaymentRow>(
      db()
        .from("payments")
        .select("id, provider, provider_payment_id, invoice_id, project_id")
        .eq("id", paymentId)
        .single()
    );

    if (!payment.provider_payment_id || payment.provider !== "mercadopago") {
      return fail(
        "Este pagamento não veio do Mercado Pago (baixa manual) — não há o que sincronizar."
      );
    }

    try {
      const result = await syncMercadoPagoPayment(payment.provider_payment_id, {
        linkId: payment.payment_link_id ?? undefined,
      });
      revalidatePayments(payment.invoice_id);

      if (result.status === "ignored") {
        return fail(result.reason ?? "O gateway não reconheceu este pagamento.");
      }

      return ok(
        null,
        `Pagamento sincronizado (status no gateway: ${result.providerStatus ?? "desconhecido"}).`
      );
    } catch (error) {
      if (error instanceof MercadoPagoNotConfiguredError) {
        return fail(
          "Mercado Pago não configurado. Defina o token de acesso em Configurações → Gateways para sincronizar transações."
        );
      }
      return fail(`Falha ao consultar o gateway: ${(error as Error).message}`);
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Chargeback                                                                  */
/* -------------------------------------------------------------------------- */

export async function registerChargebackAction(input: {
  paymentId: string;
  reason?: string | null;
  amount?: number | null;
}): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("payments:refund");

    const payment = await must<PaymentRow>(
      db().from("payments").select("*").eq("id", input.paymentId).single()
    );

    if (payment.status === "CHARGED_BACK") {
      return fail("Este pagamento já está marcado como chargeback.");
    }

    const amount =
      input.amount && input.amount > 0 ? Number(input.amount) : Number(payment.amount);

    await db().from("refunds").insert({
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      amount,
      reason: input.reason?.trim() || "Chargeback registrado manualmente",
      status: "CHARGED_BACK",
      raw_payload: { source: "manual", registered_by: user.name },
      created_by: user.id,
    });

    await db()
      .from("payments")
      .update({
        status: "CHARGED_BACK",
        refunded_amount: amount,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    await audit({
      action: "payment.charged_back",
      entityType: "payment",
      entityId: payment.id,
      entityLabel: payment.provider_payment_id,
      before: { status: payment.status },
      after: { status: "CHARGED_BACK", amount, reason: input.reason },
      actorId: user.id,
      actorLabel: user.name,
    });

    await notify({
      title: "Chargeback registrado",
      body: `Pagamento ${payment.provider_payment_id ?? payment.id} contestado pelo cliente.`,
      severity: "CRITICAL",
      category: "billing",
      entityType: "payment",
      entityId: payment.id,
      actionUrl: "/reembolsos",
    });

    await flushEventsFor(payment.project_id);
    revalidatePayments(payment.invoice_id);
    return ok(
      null,
      "Chargeback registrado. Revise a inadimplência do projeto — o acesso pode voltar a ser bloqueado."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Teste de credenciais do gateway (usado nos avisos de degradação)            */
/* -------------------------------------------------------------------------- */

export async function testGatewayAction(): Promise<ActionResult<{ message: string }>> {
  return run(async () => {
    await assertPermission("billing:read");
    const result = await mp.testCredentials();
    if (!result.ok) return fail(result.message);
    return ok({ message: result.message }, result.message);
  });
}
