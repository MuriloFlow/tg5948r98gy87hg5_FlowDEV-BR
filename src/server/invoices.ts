"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit, notify } from "@/lib/audit";
import {
  cancelInvoice,
  createInvoice,
  ensurePaymentLink,
  registerManualPayment,
  rescheduleInvoice,
  setProjectAccess,
} from "@/lib/billing";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { Invoice, InvoiceItem, PaymentLink, PaymentMethod } from "@/lib/types";

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

function revalidateBilling(invoiceId?: string | null) {
  revalidatePath("/cobrancas");
  if (invoiceId) revalidatePath(`/cobrancas/${invoiceId}`);
  revalidatePath("/inadimplencia");
  revalidatePath("/links");
  revalidatePath("/dashboard");
}

/* -------------------------------------------------------------------------- */
/* Validação do formulário de cobrança                                         */
/* -------------------------------------------------------------------------- */

const itemSchema = z.object({
  description: z.string().trim().min(1, "Descreva o item"),
  quantity: z.number().positive("Quantidade inválida"),
  unitAmount: z.number().min(0, "Valor inválido"),
});

const invoiceSchema = z
  .object({
    project_id: z.string().trim().min(1, "Selecione o projeto"),
    description: z.string().trim().min(2, "Informe a descrição da cobrança"),
    reference: z.string().trim().nullable(),
    amount: z.number().min(0),
    discount_amount: z.number().min(0, "Desconto inválido"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento"),
    is_mandatory: z.boolean(),
    expires_days: z.number().int().min(0).max(365),
    payment_methods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1, "Selecione ao menos um meio de pagamento"),
    max_installments: z.number().int().min(1).max(24),
    notes: z.string().trim().nullable(),
    internal_notes: z.string().trim().nullable(),
    items: z.array(itemSchema),
  })
  .refine((data) => data.items.length > 0 || data.amount > 0, {
    message: "Informe o valor da cobrança ou adicione itens",
    path: ["amount"],
  })
  .refine(
    (data) => {
      const subtotal = data.items.length
        ? data.items.reduce((sum, i) => sum + i.quantity * i.unitAmount, 0)
        : data.amount;
      return data.discount_amount <= subtotal;
    },
    { message: "O desconto não pode ser maior que o subtotal", path: ["discount_amount"] }
  );

function parseItems(raw: string | null): { description: string; quantity: number; unitAmount: number }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          description: String(row.description ?? "").trim(),
          quantity: Number(row.quantity ?? 1),
          unitAmount: Number(row.unitAmount ?? 0),
        };
      })
      .filter((item) => item.description.length > 0);
  } catch {
    return [];
  }
}

function parseInvoiceForm(formData: FormData) {
  const f = readForm(formData);

  return invoiceSchema.safeParse({
    project_id: f.str("project_id"),
    description: f.str("description"),
    reference: f.optional("reference"),
    amount: f.num("amount"),
    discount_amount: f.num("discount_amount"),
    due_date: f.str("due_date"),
    is_mandatory: f.bool("is_mandatory"),
    expires_days: Math.round(f.num("expires_days", 30)),
    payment_methods: f.list("payment_methods"),
    max_installments: Math.round(f.num("max_installments", 12)) || 12,
    notes: f.optional("notes"),
    internal_notes: f.optional("internal_notes"),
    items: parseItems(f.optional("items")),
  });
}

/** due_date (YYYY-MM-DD) + N dias → timestamp ISO usado em expires_at. */
function expiresAtFrom(dueDate: string, days: number): string | null {
  if (!days) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(y, m - 1, d, 23, 59, 59);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/* -------------------------------------------------------------------------- */
/* Criar / atualizar                                                           */
/* -------------------------------------------------------------------------- */

export async function createInvoiceAction(
  _prev: ActionResult<Invoice> | null,
  formData: FormData
): Promise<ActionResult<Invoice>> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const parsed = parseInvoiceForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const data = parsed.data;

    const invoice = await createInvoice({
      projectId: data.project_id,
      description: data.description,
      amount: data.amount,
      dueDate: data.due_date,
      reference: data.reference,
      discountAmount: data.discount_amount,
      isMandatory: data.is_mandatory,
      paymentMethods: data.payment_methods as PaymentMethod[],
      maxInstallments: data.max_installments,
      allowInstallments: data.max_installments > 1,
      expiresAt: expiresAtFrom(data.due_date, data.expires_days),
      notes: data.notes,
      internalNotes: data.internal_notes,
      items: data.items.length ? data.items : undefined,
      createdBy: user.id,
    });

    // O link público é o canal de pagamento da cobrança, então já nasce junto.
    // Uma indisponibilidade do gateway não pode invalidar a emissão.
    let link: PaymentLink | null = null;
    try {
      link = await ensurePaymentLink(invoice.id, { createdBy: user.id });
    } catch (error) {
      console.warn("[flowdesk] link não gerado na emissão:", (error as Error).message);
    }

    revalidateBilling(invoice.id);
    return ok(
      invoice,
      link
        ? `Cobrança ${invoice.code} emitida com link de pagamento.`
        : `Cobrança ${invoice.code} emitida. Gere o link de pagamento pelo menu de ações.`
    );
  });
}

export async function updateInvoiceAction(
  _prev: ActionResult<Invoice> | null,
  formData: FormData
): Promise<ActionResult<Invoice>> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Cobrança não identificada.");

    const parsed = parseInvoiceForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const data = parsed.data;
    const before = await must<Invoice>(
      db().from("invoices").select("*").eq("id", id).single()
    );

    if (before.status === "PAID" || before.status === "REFUNDED") {
      return fail("Cobranças quitadas ou estornadas não podem ser editadas.");
    }

    // O trigger de invoice_items recalcula o subtotal: limpamos e reinserimos.
    await db().from("invoice_items").delete().eq("invoice_id", id);

    const invoice = await must<Invoice>(
      db()
        .from("invoices")
        .update({
          description: data.description,
          reference: data.reference,
          // sem itens o subtotal é o valor único informado
          subtotal: data.items.length ? 0 : data.amount,
          discount_amount: data.discount_amount,
          due_date: data.due_date,
          is_mandatory: data.is_mandatory,
          payment_methods: data.payment_methods,
          max_installments: data.max_installments,
          allow_installments: data.max_installments > 1,
          expires_at: expiresAtFrom(data.due_date, data.expires_days),
          notes: data.notes,
          internal_notes: data.internal_notes,
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    if (data.items.length) {
      await db()
        .from("invoice_items")
        .insert(
          data.items.map((item, index) => ({
            invoice_id: id,
            description: item.description,
            quantity: item.quantity,
            unit_amount: item.unitAmount,
            position: index,
          }))
        );
    }

    await audit({
      action: "invoice.updated",
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: invoice.code,
      before,
      after: invoice,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling(invoice.id);
    return ok(invoice, `Cobrança ${invoice.code} atualizada.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Ciclo de vida                                                               */
/* -------------------------------------------------------------------------- */

export async function cancelInvoiceAction(
  id: string,
  reason?: string | null
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const current = await must<Pick<Invoice, "id" | "status" | "code">>(
      db().from("invoices").select("id, status, code").eq("id", id).single()
    );

    if (current.status === "PAID") {
      return fail("Esta cobrança já foi paga. Use um estorno em Reembolsos.");
    }
    if (current.status === "CANCELED") {
      return fail("Esta cobrança já está cancelada.");
    }

    const invoice = await cancelInvoice({
      invoiceId: id,
      reason: reason?.trim() || null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling(id);
    return ok(null, `Cobrança ${invoice.code} cancelada e links desativados.`);
  });
}

export async function rescheduleInvoiceAction(
  id: string,
  dueDate: string,
  reason?: string | null
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return fail("Informe uma data de vencimento válida.");
    }

    const invoice = await rescheduleInvoice({
      invoiceId: id,
      dueDate,
      reason: reason?.trim() || null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling(id);
    return ok(null, `Vencimento de ${invoice.code} alterado.`);
  });
}

export async function toggleMandatoryAction(
  id: string,
  isMandatory: boolean
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const invoice = await must<Invoice>(
      db()
        .from("invoices")
        .update({ is_mandatory: isMandatory })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "invoice.mandatory_changed",
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: invoice.code,
      after: { is_mandatory: isMandatory },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling(id);
    return ok(
      null,
      isMandatory
        ? "Cobrança marcada como obrigatória: o projeto será bloqueado se ela vencer."
        : "Cobrança marcada como opcional: o vencimento não bloqueia o projeto."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Baixa manual                                                                */
/* -------------------------------------------------------------------------- */

export async function registerManualPaymentAction(input: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return fail("Informe um valor maior que zero.");
    }

    const invoice = await must<Invoice>(
      db().from("invoices").select("*").eq("id", input.invoiceId).single()
    );

    if (invoice.status === "CANCELED") {
      return fail("Não é possível dar baixa em uma cobrança cancelada.");
    }

    const balance = Number(invoice.total) - Number(invoice.paid_amount);
    if (input.amount > balance + 0.01) {
      return fail(
        `O valor informado excede o saldo em aberto desta cobrança (${balance.toFixed(2)}).`
      );
    }

    await registerManualPayment({
      invoiceId: input.invoiceId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt ? new Date(input.paidAt).toISOString() : undefined,
      note: input.note?.trim() || null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling(input.invoiceId);
    revalidatePath("/pagamentos");
    return ok(
      null,
      "Baixa registrada. O projeto é liberado automaticamente quando a cobrança fica quitada."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Payment link da cobrança                                                    */
/* -------------------------------------------------------------------------- */

export async function generatePaymentLinkAction(
  invoiceId: string,
  options: { forceNew?: boolean } = {}
): Promise<ActionResult<{ token: string; checkoutUrl: string | null }>> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const link = await ensurePaymentLink(invoiceId, {
      forceNew: options.forceNew,
      createdBy: user.id,
    });

    revalidateBilling(invoiceId);

    return ok(
      { token: link.token, checkoutUrl: link.checkout_url },
      link.checkout_url
        ? "Link de pagamento pronto."
        : "Link criado. O checkout do Mercado Pago será provisionado quando o gateway estiver configurado."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Cobrança / reenvio                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Registra a cobrança/reenvio para o cliente. O FlowDesk não dispara e-mail
 * nesta versão: a ação grava o histórico, incrementa o contador de lembretes e
 * cria uma notificação interna para a equipe acompanhar.
 */
export async function sendReminderAction(
  invoiceId: string,
  channel: "email" | "whatsapp" = "email"
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const invoice = await must<Invoice>(
      db().from("invoices").select("*").eq("id", invoiceId).single()
    );

    if (invoice.status === "PAID" || invoice.status === "CANCELED") {
      return fail("Esta cobrança não está aguardando pagamento.");
    }

    const { data: customer } = await db()
      .from("customers")
      .select("name, email")
      .eq("id", invoice.customer_id)
      .maybeSingle();

    const count = (invoice.reminder_count ?? 0) + 1;
    const now = new Date().toISOString();

    await db()
      .from("invoices")
      .update({ reminder_count: count, last_reminder_at: now })
      .eq("id", invoiceId);

    const channelLabel = channel === "whatsapp" ? "WhatsApp" : "e-mail";

    await db().from("activity_log").insert({
      entity_type: "invoice",
      entity_id: invoice.id,
      project_id: invoice.project_id,
      kind: channel === "whatsapp" ? "note" : "email",
      title: `Cobrança ${invoice.code} reenviada (${channelLabel})`,
      description: customer?.email
        ? `Registro de reenvio para ${customer.name} · ${customer.email}. Envio ${count}.`
        : `Registro de reenvio. Envio ${count}.`,
      icon: "send",
      actor_type: "ADMIN",
      actor_label: user.name,
      metadata: { reminder_count: count, channel },
    });

    await notify({
      title: `Reenvio registrado: ${invoice.code}`,
      body: `${customer?.name ?? "Cliente"} — ${channelLabel}. Total de reenvios: ${count}.`,
      severity: "INFO",
      category: "billing",
      entityType: "invoice",
      entityId: invoice.id,
      actionUrl: `/cobrancas/${invoice.id}`,
    });

    await audit({
      action: "invoice.reminder_sent",
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: invoice.code,
      after: { reminder_count: count, channel },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling(invoiceId);
    return ok(null, `Reenvio nº ${count} registrado no histórico da cobrança.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Duplicar                                                                    */
/* -------------------------------------------------------------------------- */

export async function duplicateInvoiceAction(id: string): Promise<ActionResult<Invoice>> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const source = await must<Invoice>(
      db().from("invoices").select("*").eq("id", id).single()
    );

    const { data: items } = await db()
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("position", { ascending: true });

    // mesmo dia do mês, um mês adiante
    const [y, m, d] = source.due_date.split("-").map(Number);
    const next = new Date(y, m - 1, d);
    next.setMonth(next.getMonth() + 1);
    const dueDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
      next.getDate()
    ).padStart(2, "0")}`;

    const invoice = await createInvoice({
      projectId: source.project_id,
      description: source.description,
      amount: Number(source.subtotal),
      dueDate,
      reference: source.reference,
      discountAmount: Number(source.discount_amount),
      isMandatory: source.is_mandatory,
      paymentMethods: source.payment_methods,
      maxInstallments: source.max_installments,
      allowInstallments: source.allow_installments,
      notes: source.notes,
      internalNotes: source.internal_notes,
      items: (items as InvoiceItem[] | null)?.length
        ? (items as InvoiceItem[]).map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitAmount: Number(item.unit_amount),
          }))
        : undefined,
      createdBy: user.id,
    });

    revalidateBilling(invoice.id);
    return ok(invoice, `Cobrança duplicada como ${invoice.code}.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Ações em lote (usadas na tela de inadimplência)                             */
/* -------------------------------------------------------------------------- */

interface BulkResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

export async function bulkSendRemindersAction(ids: string[]): Promise<ActionResult<BulkResult>> {
  return run(async () => {
    await assertPermission("billing:write");
    const result: BulkResult = { succeeded: 0, failed: 0, errors: [] };

    for (const id of ids) {
      const outcome = await sendReminderAction(id);
      if (outcome.ok) result.succeeded++;
      else {
        result.failed++;
        if (outcome.error) result.errors.push(outcome.error);
      }
    }

    revalidateBilling();
    return ok(
      result,
      `${result.succeeded} cobrança(s) reenviada(s)${result.failed ? ` · ${result.failed} falha(s)` : ""}.`
    );
  });
}

export async function bulkGenerateLinksAction(ids: string[]): Promise<ActionResult<BulkResult>> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const result: BulkResult = { succeeded: 0, failed: 0, errors: [] };

    for (const id of ids) {
      try {
        await ensurePaymentLink(id, { forceNew: true, createdBy: user.id });
        result.succeeded++;
      } catch (error) {
        result.failed++;
        result.errors.push((error as Error).message);
      }
    }

    revalidateBilling();
    return ok(
      result,
      `${result.succeeded} link(s) gerado(s)${result.failed ? ` · ${result.failed} falha(s)` : ""}.`
    );
  });
}

/**
 * Bloqueio manual do projeto a partir da régua de cobrança. Reaproveita a regra
 * de acesso do núcleo de billing — a tela de projetos pertence a outro módulo.
 */
export async function blockProjectAction(
  projectId: string,
  reason?: string | null
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:block");

    const project = await setProjectAccess({
      projectId,
      action: "BLOCK",
      reason: reason?.trim() || "Bloqueio manual pela régua de inadimplência",
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateBilling();
    revalidatePath("/projetos");
    revalidatePath("/bloqueios");
    return ok(null, `Projeto ${project.name} bloqueado.`);
  });
}

export async function bulkBlockProjectsAction(
  projectIds: string[],
  reason?: string | null
): Promise<ActionResult<BulkResult>> {
  return run(async () => {
    await assertPermission("projects:block");
    const result: BulkResult = { succeeded: 0, failed: 0, errors: [] };

    for (const projectId of new Set(projectIds)) {
      const outcome = await blockProjectAction(projectId, reason);
      if (outcome.ok) result.succeeded++;
      else {
        result.failed++;
        if (outcome.error) result.errors.push(outcome.error);
      }
    }

    return ok(
      result,
      `${result.succeeded} projeto(s) bloqueado(s)${result.failed ? ` · ${result.failed} falha(s)` : ""}.`
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Consulta auxiliar usada pelos menus de ação                                 */
/* -------------------------------------------------------------------------- */

export async function getInvoiceLinkAction(
  invoiceId: string
): Promise<ActionResult<{ token: string; checkoutUrl: string | null }>> {
  return run(async () => {
    await assertPermission("billing:read");

    const { data } = await db()
      .from("payment_links")
      .select("token, checkout_url")
      .eq("invoice_id", invoiceId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return fail("Esta cobrança ainda não possui link ativo.");

    const link = data as Pick<PaymentLink, "token" | "checkout_url">;
    return ok({ token: link.token, checkoutUrl: link.checkout_url });
  });
}
