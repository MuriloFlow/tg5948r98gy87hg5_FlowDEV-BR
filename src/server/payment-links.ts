"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { createPaymentLink, provisionCheckout } from "@/lib/billing";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { Customer, Invoice, PaymentLink, PaymentMethod, Project } from "@/lib/types";

const PAYMENT_METHODS = [
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BOLETO",
  "ACCOUNT_MONEY",
  "BANK_TRANSFER",
  "CASH",
  "MANUAL",
  "OTHER",
] as const;

function revalidateLinks(invoiceId?: string | null) {
  revalidatePath("/links");
  revalidatePath("/cobrancas");
  if (invoiceId) revalidatePath(`/cobrancas/${invoiceId}`);
  revalidatePath("/dashboard");
}

const linkSchema = z
  .object({
    project_id: z.string().trim().min(1, "Selecione o projeto"),
    invoice_id: z.string().trim().nullable(),
    title: z.string().trim().min(2, "Informe o título do link"),
    description: z.string().trim().nullable(),
    amount: z.number().min(0),
    payment_methods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1, "Selecione ao menos um meio de pagamento"),
    max_installments: z.number().int().min(1).max(24),
    expires_days: z.number().int().min(1).max(365),
    max_uses: z.number().int().min(1).max(1000),
  })
  .refine((data) => Boolean(data.invoice_id) || data.amount > 0, {
    message: "Informe o valor do link",
    path: ["amount"],
  });

function parseLinkForm(formData: FormData) {
  const f = readForm(formData);

  return linkSchema.safeParse({
    project_id: f.str("project_id"),
    invoice_id: f.optional("invoice_id"),
    title: f.str("title"),
    description: f.optional("description"),
    amount: f.num("amount"),
    payment_methods: f.list("payment_methods"),
    max_installments: Math.round(f.num("max_installments", 12)) || 12,
    expires_days: Math.round(f.num("expires_days", 30)) || 30,
    max_uses: Math.round(f.num("max_uses", 1)) || 1,
  });
}

/* -------------------------------------------------------------------------- */
/* Criação                                                                     */
/* -------------------------------------------------------------------------- */

export async function createStandaloneLinkAction(
  _prev: ActionResult<PaymentLink> | null,
  formData: FormData
): Promise<ActionResult<PaymentLink>> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const parsed = parseLinkForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const data = parsed.data;
    const expiresAt = new Date(Date.now() + data.expires_days * 86_400_000).toISOString();

    const link = await createPaymentLink({
      invoiceId: data.invoice_id,
      projectId: data.project_id,
      title: data.title,
      description: data.description,
      amount: data.amount,
      paymentMethods: data.payment_methods as PaymentMethod[],
      maxInstallments: data.max_installments,
      expiresAt,
      maxUses: data.max_uses,
      createdBy: user.id,
    });

    revalidateLinks(link.invoice_id);
    return ok(
      link,
      link.checkout_url
        ? "Link de pagamento criado e checkout provisionado."
        : "Link criado. O checkout será provisionado quando o Mercado Pago estiver configurado."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Manutenção                                                                  */
/* -------------------------------------------------------------------------- */

export async function disableLinkAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const link = await must<PaymentLink>(
      db().from("payment_links").select("*").eq("id", id).single()
    );

    if (link.status === "PAID") return fail("Este link já foi pago e não pode ser desativado.");

    const updated = await must<PaymentLink>(
      db()
        .from("payment_links")
        .update({ status: "DISABLED" })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "payment_link.disabled",
      entityType: "payment_link",
      entityId: updated.id,
      entityLabel: updated.token,
      before: { status: link.status },
      after: { status: "DISABLED" },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateLinks(updated.invoice_id);
    return ok(null, "Link desativado. A página pública deixa de aceitar pagamentos.");
  });
}

/**
 * Remove o link em definitivo. Só é permitido quando nenhuma transação real
 * passou por ele — caso contrário o histórico financeiro ficaria órfão e a
 * saída correta é desativar.
 */
export async function deleteLinkAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const link = await must<PaymentLink>(
      db().from("payment_links").select("*").eq("id", id).single()
    );

    if (link.status === "PAID") {
      return fail("Este link já foi pago. Ele faz parte do histórico e não pode ser excluído.");
    }

    const { count } = await db()
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("payment_link_id", id)
      .not("status", "in", "(REJECTED,CANCELLED)");

    if ((count ?? 0) > 0) {
      return fail(
        "Existem pagamentos vinculados a este link. Desative-o para interromper novas cobranças sem perder o histórico."
      );
    }

    await must(db().from("payment_links").delete().eq("id", id).select("id").single());

    await audit({
      action: "payment_link.deleted",
      entityType: "payment_link",
      entityId: link.id,
      entityLabel: link.token,
      before: {
        token: link.token,
        title: link.title,
        amount: link.amount,
        status: link.status,
        invoice_id: link.invoice_id,
      },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateLinks(link.invoice_id);
    return ok(null, "Link excluído. A URL pública deixa de existir.");
  });
}

/** Recria a preferência de checkout no gateway sem trocar o token público. */
export async function regenerateCheckoutAction(id: string): Promise<ActionResult<PaymentLink>> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const link = await must<PaymentLink>(
      db().from("payment_links").select("*").eq("id", id).single()
    );

    if (link.status !== "ACTIVE") {
      return fail("Só é possível provisionar o checkout de links ativos.");
    }

    const project = await must<Project>(
      db().from("projects").select("*").eq("id", link.project_id).single()
    );
    const customer = await must<Customer>(
      db().from("customers").select("*").eq("id", link.customer_id).single()
    );

    let invoice: Invoice | null = null;
    if (link.invoice_id) {
      const { data } = await db().from("invoices").select("*").eq("id", link.invoice_id).maybeSingle();
      invoice = (data as Invoice | null) ?? null;
    }

    const updated = await provisionCheckout(link, invoice, customer, project);

    await audit({
      action: "payment_link.checkout_regenerated",
      entityType: "payment_link",
      entityId: updated.id,
      entityLabel: updated.token,
      after: { checkout_url: updated.checkout_url },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateLinks(updated.invoice_id);

    if (!updated.checkout_url) {
      return fail(
        "Não foi possível falar com o Mercado Pago. O link continua válido, mas sem checkout — confira as credenciais em Gateways."
      );
    }

    return ok(updated, "Checkout provisionado com sucesso.");
  });
}

export async function extendExpirationAction(
  id: string,
  days: number
): Promise<ActionResult<PaymentLink>> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return fail("Informe entre 1 e 365 dias.");
    }

    const link = await must<PaymentLink>(
      db().from("payment_links").select("*").eq("id", id).single()
    );

    const base = link.expires_at ? new Date(link.expires_at) : new Date();
    const from = base.getTime() > Date.now() ? base : new Date();
    const expiresAt = new Date(from.getTime() + days * 86_400_000).toISOString();

    const updated = await must<PaymentLink>(
      db()
        .from("payment_links")
        .update({
          expires_at: expiresAt,
          status: link.status === "EXPIRED" ? "ACTIVE" : link.status,
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "payment_link.expiration_extended",
      entityType: "payment_link",
      entityId: updated.id,
      entityLabel: updated.token,
      before: { expires_at: link.expires_at },
      after: { expires_at: expiresAt },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateLinks(updated.invoice_id);
    return ok(updated, `Validade estendida por ${days} dia(s).`);
  });
}
