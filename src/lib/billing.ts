import "server-only";
import { db, must } from "./db";
import { env } from "./env";
import { generatePublicToken, generateShortCode } from "./api-keys";
import { audit, notify } from "./audit";
import * as mp from "./mercadopago";
import { dispatchEvent } from "./webhooks";
import type {
  ActorType,
  Invoice,
  PaymentLink,
  PaymentMethod,
  Project,
  Customer,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Criação de cobranças                                                        */
/* -------------------------------------------------------------------------- */

export interface CreateInvoiceInput {
  projectId: string;
  description: string;
  amount: number;
  dueDate: string;
  reference?: string | null;
  discountAmount?: number;
  isMandatory?: boolean;
  paymentMethods?: PaymentMethod[];
  maxInstallments?: number;
  allowInstallments?: boolean;
  expiresAt?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  subscriptionId?: string | null;
  metadata?: Record<string, unknown>;
  createdVia?: ActorType;
  createdBy?: string | null;
  idempotencyKey?: string | null;
  items?: { description: string; quantity: number; unitAmount: number }[];
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const project = await must<Pick<Project, "id" | "customer_id" | "name" | "currency">>(
    db().from("projects").select("id, customer_id, name, currency").eq("id", input.projectId).single()
  );

  if (input.idempotencyKey) {
    const { data: existing } = await db()
      .from("invoices")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return existing as Invoice;
  }

  const subtotal =
    input.items?.length
      ? input.items.reduce((sum, i) => sum + i.quantity * i.unitAmount, 0)
      : input.amount;

  const invoice = await must<Invoice>(
    db()
      .from("invoices")
      .insert({
        project_id: project.id,
        customer_id: project.customer_id,
        subscription_id: input.subscriptionId ?? null,
        description: input.description,
        reference: input.reference ?? null,
        subtotal,
        discount_amount: input.discountAmount ?? 0,
        total: Math.max(subtotal - (input.discountAmount ?? 0), 0),
        currency: project.currency ?? "BRL",
        status: "OPEN",
        due_date: input.dueDate,
        expires_at: input.expiresAt ?? null,
        is_mandatory: input.isMandatory ?? true,
        payment_methods: input.paymentMethods ?? ["PIX", "CREDIT_CARD", "BOLETO"],
        allow_installments: input.allowInstallments ?? true,
        max_installments: input.maxInstallments ?? 12,
        notes: input.notes ?? null,
        internal_notes: input.internalNotes ?? null,
        metadata: input.metadata ?? {},
        idempotency_key: input.idempotencyKey ?? null,
        created_via: input.createdVia ?? "ADMIN",
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single()
  );

  if (input.items?.length) {
    await db().from("invoice_items").insert(
      input.items.map((item, index) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_amount: item.unitAmount,
        position: index,
      }))
    );
  }

  await audit({
    action: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: invoice.code,
    after: invoice,
    actorType: input.createdVia ?? "ADMIN",
    actorId: input.createdBy ?? null,
  });

  return invoice;
}

/* -------------------------------------------------------------------------- */
/* Payment Links + Checkout                                                    */
/* -------------------------------------------------------------------------- */

export interface CreatePaymentLinkInput {
  invoiceId?: string | null;
  projectId?: string;
  title?: string;
  description?: string | null;
  amount?: number;
  paymentMethods?: PaymentMethod[];
  maxInstallments?: number;
  expiresAt?: string | null;
  maxUses?: number;
  createdVia?: ActorType;
  createdBy?: string | null;
}

/**
 * Cria o link público e, se o Mercado Pago estiver configurado, já provisiona a
 * preferência de checkout. Sem gateway, o link continua funcional (a página
 * pública mostra os dados da cobrança e avisa que o checkout está indisponível).
 */
export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
  let invoice: Invoice | null = null;

  if (input.invoiceId) {
    invoice = await must<Invoice>(
      db().from("invoices").select("*").eq("id", input.invoiceId).single()
    );
  }

  const projectId = invoice?.project_id ?? input.projectId;
  if (!projectId) throw new Error("Informe uma cobrança ou um projeto para gerar o link");

  const project = await must<Project>(
    db().from("projects").select("*").eq("id", projectId).single()
  );
  const customer = await must<Customer>(
    db().from("customers").select("*").eq("id", project.customer_id).single()
  );

  const amount = invoice ? invoice.total - invoice.paid_amount : input.amount ?? 0;
  if (amount <= 0) throw new Error("O valor do link precisa ser maior que zero");

  const token = generatePublicToken(14);
  const methods = input.paymentMethods ?? invoice?.payment_methods ?? ["PIX", "CREDIT_CARD", "BOLETO"];
  const title = input.title ?? invoice?.description ?? `Pagamento — ${project.name}`;

  const link = await must<PaymentLink>(
    db()
      .from("payment_links")
      .insert({
        invoice_id: invoice?.id ?? null,
        project_id: project.id,
        customer_id: customer.id,
        token,
        short_code: generateShortCode(),
        title,
        description: input.description ?? invoice?.reference ?? null,
        amount,
        currency: invoice?.currency ?? "BRL",
        provider: "mercadopago",
        status: "ACTIVE",
        expires_at:
          input.expiresAt ??
          invoice?.expires_at ??
          new Date(Date.now() + 30 * 86_400_000).toISOString(),
        max_uses: input.maxUses ?? 1,
        payment_methods: methods,
        max_installments: input.maxInstallments ?? invoice?.max_installments ?? 12,
        created_via: input.createdVia ?? "ADMIN",
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single()
  );

  const checkout = await provisionCheckout(link, invoice, customer, project);

  await audit({
    action: "payment_link.created",
    entityType: "payment_link",
    entityId: link.id,
    entityLabel: link.token,
    after: checkout,
    actorType: input.createdVia ?? "ADMIN",
    actorId: input.createdBy ?? null,
  });

  return checkout;
}

/** Cria (ou recria) a preferência do Mercado Pago para um link existente. */
export async function provisionCheckout(
  link: PaymentLink,
  invoice: Invoice | null,
  customer: Customer,
  project: Project
): Promise<PaymentLink> {
  const base = env.appUrl;

  try {
    const preference = await mp.createPreference({
      title: link.title,
      description: link.description ?? project.name,
      amount: link.amount,
      externalReference: `link:${link.id}`,
      payerName: customer.name,
      payerEmail: customer.email,
      payerDocument: customer.document,
      methods: link.payment_methods,
      maxInstallments: link.max_installments,
      successUrl: `${base}/pay/${link.token}/sucesso`,
      failureUrl: `${base}/pay/${link.token}/falha`,
      pendingUrl: `${base}/pay/${link.token}/pendente`,
      expiresAt: link.expires_at,
      statementDescriptor: project.name.slice(0, 22).toUpperCase(),
      metadata: {
        flowdesk_link_id: link.id,
        flowdesk_invoice_id: invoice?.id ?? null,
        flowdesk_project_id: project.id,
      },
    });

    return await must<PaymentLink>(
      db()
        .from("payment_links")
        .update({
          provider_preference_id: preference.id,
          checkout_url: preference.initPoint,
        })
        .eq("id", link.id)
        .select("*")
        .single()
    );
  } catch (error) {
    // Sem gateway configurado o link continua válido — o checkout é provisionado depois.
    console.warn("[flowdesk] checkout não provisionado:", (error as Error).message);
    return link;
  }
}

/**
 * Garante um link ativo sem esperar o Mercado Pago — a página /pay/[token] gera Pix na hora.
 */
export async function ensurePaymentLinkFast(
  invoiceId: string,
  options: { createdVia?: ActorType } = {}
): Promise<PaymentLink> {
  const { data: existing } = await db()
    .from("payment_links")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const link = existing as PaymentLink;
    const notExpired = !link.expires_at || new Date(link.expires_at) > new Date();
    if (notExpired) {
      if (!link.checkout_url) {
        void provisionCheckoutInBackground(link.id).catch(() => undefined);
      }
      return link;
    }
  }

  const invoice = await must<Invoice>(db().from("invoices").select("*").eq("id", invoiceId).single());
  const project = await must<Project>(
    db().from("projects").select("*").eq("id", invoice.project_id).single()
  );
  const customer = await must<Customer>(
    db().from("customers").select("*").eq("id", invoice.customer_id).single()
  );

  const amount = invoice.total - invoice.paid_amount;
  if (amount <= 0) throw new Error("Cobrança já quitada");

  const link = await must<PaymentLink>(
    db()
      .from("payment_links")
      .insert({
        invoice_id: invoice.id,
        project_id: project.id,
        customer_id: customer.id,
        token: generatePublicToken(14),
        short_code: generateShortCode(),
        title: invoice.description ?? `Pagamento — ${project.name}`,
        description: invoice.reference ?? null,
        amount,
        currency: invoice.currency,
        provider: "mercadopago",
        status: "ACTIVE",
        expires_at: invoice.expires_at ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
        max_uses: 1,
        payment_methods: invoice.payment_methods,
        max_installments: invoice.max_installments,
        created_via: options.createdVia ?? "API",
      })
      .select("*")
      .single()
  );

  void provisionCheckoutInBackground(link.id).catch(() => undefined);
  return link;
}

async function provisionCheckoutInBackground(linkId: string) {
  const link = await must<PaymentLink>(db().from("payment_links").select("*").eq("id", linkId).single());
  if (link.checkout_url) return;

  const invoice = link.invoice_id
    ? await must<Invoice>(db().from("invoices").select("*").eq("id", link.invoice_id).single())
    : null;
  const project = await must<Project>(
    db().from("projects").select("*").eq("id", link.project_id).single()
  );
  const customer = await must<Customer>(
    db().from("customers").select("*").eq("id", link.customer_id).single()
  );

  await provisionCheckout(link, invoice, customer, project);
}

/** Garante que a cobrança tenha um link ativo, reaproveitando se já existir. */
export async function ensurePaymentLink(
  invoiceId: string,
  options: { forceNew?: boolean; createdBy?: string | null; createdVia?: ActorType } = {}
): Promise<PaymentLink> {
  if (!options.forceNew) {
    const { data: existing } = await db()
      .from("payment_links")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const link = existing as PaymentLink;
      const notExpired = !link.expires_at || new Date(link.expires_at) > new Date();
      if (link.checkout_url && notExpired) return link;

      // link existe mas ficou sem checkout (gateway indisponível na criação)
      if (!link.checkout_url && notExpired) {
        const invoice = await must<Invoice>(
          db().from("invoices").select("*").eq("id", invoiceId).single()
        );
        const project = await must<Project>(
          db().from("projects").select("*").eq("id", invoice.project_id).single()
        );
        const customer = await must<Customer>(
          db().from("customers").select("*").eq("id", invoice.customer_id).single()
        );
        return provisionCheckout(link, invoice, customer, project);
      }
    }
  } else {
    await db()
      .from("payment_links")
      .update({ status: "DISABLED" })
      .eq("invoice_id", invoiceId)
      .eq("status", "ACTIVE");
  }

  return createPaymentLink({
    invoiceId,
    createdBy: options.createdBy ?? null,
    createdVia: options.createdVia ?? "ADMIN",
  });
}

/* -------------------------------------------------------------------------- */
/* Baixa manual                                                                */
/* -------------------------------------------------------------------------- */

export async function registerManualPayment(input: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}) {
  const invoice = await must<Invoice>(
    db().from("invoices").select("*").eq("id", input.invoiceId).single()
  );

  const payment = await must<{ id: string }>(
    db()
      .from("payments")
      .insert({
        invoice_id: invoice.id,
        project_id: invoice.project_id,
        customer_id: invoice.customer_id,
        provider: "manual",
        provider_payment_id: `manual_${Date.now()}`,
        method: input.method,
        status: "APPROVED",
        amount: input.amount,
        net_amount: input.amount,
        currency: invoice.currency,
        approved_at: input.paidAt ?? new Date().toISOString(),
        metadata: { note: input.note ?? null, registered_by: input.actorLabel ?? null },
      })
      .select("id")
      .single()
  );

  await audit({
    action: "payment.manual_registered",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: invoice.code,
    after: { amount: input.amount, method: input.method },
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
  });

  await flushEventsFor(invoice.project_id);
  return payment;
}

/* -------------------------------------------------------------------------- */
/* Bloqueio / liberação manual                                                 */
/* -------------------------------------------------------------------------- */

export async function setProjectAccess(input: {
  projectId: string;
  action: "BLOCK" | "UNBLOCK" | "SUSPEND" | "ACTIVATE";
  reason?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}) {
  const project = await must<Project>(
    db().from("projects").select("*").eq("id", input.projectId).single()
  );

  const nextStatus =
    input.action === "BLOCK"
      ? "BLOCKED_PAYMENT"
      : input.action === "SUSPEND"
        ? "SUSPENDED"
        : "ACTIVE";

  const updated = await must<Project>(
    db()
      .from("projects")
      .update({
        status: nextStatus,
        blocked_at: nextStatus === "BLOCKED_PAYMENT" ? new Date().toISOString() : null,
        blocked_reason:
          nextStatus === "BLOCKED_PAYMENT"
            ? (input.reason ?? "Bloqueio manual pelo administrador")
            : null,
        blocked_by: nextStatus === "BLOCKED_PAYMENT" ? (input.actorId ?? null) : null,
        unblocked_at: nextStatus === "ACTIVE" ? new Date().toISOString() : project.unblocked_at,
      })
      .eq("id", project.id)
      .select("*")
      .single()
  );

  await db().rpc("emit_event", {
    p_type: nextStatus === "BLOCKED_PAYMENT" ? "project.blocked" : "project.unblocked",
    p_project_id: project.id,
    p_resource_type: "project",
    p_resource_id: project.id,
    p_payload: {
      project_id: project.id,
      status: nextStatus,
      reason: input.reason ?? null,
      automatic: false,
    },
  });

  await audit({
    action: nextStatus === "BLOCKED_PAYMENT" ? "project.blocked" : "project.unblocked",
    entityType: "project",
    entityId: project.id,
    entityLabel: project.name,
    before: { status: project.status },
    after: { status: nextStatus, reason: input.reason },
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
  });

  await notify({
    title:
      nextStatus === "BLOCKED_PAYMENT"
        ? `Projeto bloqueado: ${project.name}`
        : `Projeto liberado: ${project.name}`,
    body: input.reason ?? "Alteração manual pelo painel",
    severity: nextStatus === "BLOCKED_PAYMENT" ? "WARNING" : "SUCCESS",
    category: "access",
    entityType: "project",
    entityId: project.id,
    actionUrl: `/projetos/${project.id}`,
  });

  await flushEventsFor(project.id);
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Utilitários                                                                 */
/* -------------------------------------------------------------------------- */

/** Entrega imediatamente os eventos pendentes do projeto (best-effort). */
export async function flushEventsFor(projectId: string): Promise<void> {
  try {
    const { data: events } = await db()
      .from("events")
      .select("id")
      .eq("project_id", projectId)
      .eq("delivered", false)
      .order("created_at", { ascending: true })
      .limit(20);

    for (const event of events ?? []) {
      await dispatchEvent(event.id);
    }
  } catch (error) {
    console.error("[flowdesk] falha ao entregar eventos:", (error as Error).message);
  }
}

export async function cancelInvoice(input: {
  invoiceId: string;
  reason?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}) {
  const invoice = await must<Invoice>(
    db()
      .from("invoices")
      .update({
        status: "CANCELED",
        canceled_at: new Date().toISOString(),
        cancel_reason: input.reason ?? null,
      })
      .eq("id", input.invoiceId)
      .select("*")
      .single()
  );

  await db()
    .from("payment_links")
    .update({ status: "DISABLED" })
    .eq("invoice_id", invoice.id)
    .eq("status", "ACTIVE");

  await audit({
    action: "invoice.canceled",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: invoice.code,
    after: { reason: input.reason },
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
  });

  await flushEventsFor(invoice.project_id);
  return invoice;
}

export async function rescheduleInvoice(input: {
  invoiceId: string;
  dueDate: string;
  reason?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}) {
  const before = await must<Invoice>(
    db().from("invoices").select("*").eq("id", input.invoiceId).single()
  );

  const invoice = await must<Invoice>(
    db()
      .from("invoices")
      .update({
        due_date: input.dueDate,
        // reabre cobranças que já estavam vencidas
        status: before.status === "OVERDUE" || before.status === "EXPIRED" ? "OPEN" : before.status,
      })
      .eq("id", input.invoiceId)
      .select("*")
      .single()
  );

  await audit({
    action: "invoice.rescheduled",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: invoice.code,
    before: { due_date: before.due_date },
    after: { due_date: input.dueDate, reason: input.reason },
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
  });

  await flushEventsFor(invoice.project_id);
  return invoice;
}
