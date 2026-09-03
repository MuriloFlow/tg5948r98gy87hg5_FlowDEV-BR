"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit, notify } from "@/lib/audit";
import { flushEventsFor } from "@/lib/billing";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { BillingInterval, Project, Subscription } from "@/lib/types";

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

const INTERVALS = [
  "ONE_TIME",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
] as const;

function revalidateSubscriptions(id?: string | null) {
  revalidatePath("/assinaturas");
  if (id) revalidatePath(`/assinaturas/${id}`);
  revalidatePath("/cobrancas");
  revalidatePath("/dashboard");
}

/* -------------------------------------------------------------------------- */
/* Cálculo do próximo vencimento (espelha calc_next_billing_date no banco)      */
/* -------------------------------------------------------------------------- */

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function fromISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addInterval(date: Date, interval: BillingInterval, count: number): Date {
  const next = new Date(date);
  switch (interval) {
    case "WEEKLY":
      next.setDate(next.getDate() + 7 * count);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14 * count);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + count);
      break;
    case "BIMONTHLY":
      next.setMonth(next.getMonth() + 2 * count);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3 * count);
      break;
    case "SEMIANNUAL":
      next.setMonth(next.getMonth() + 6 * count);
      break;
    case "ANNUAL":
      next.setFullYear(next.getFullYear() + count);
      break;
    default:
      break;
  }
  return next;
}

/**
 * Primeira cobrança da recorrência: respeita o dia fixo ("todo dia 5") e nunca
 * cai antes do início da assinatura. Sem dia fixo, usa o próprio start_date.
 */
function computeNextBillingDate(
  startDate: string,
  interval: BillingInterval,
  intervalCount: number,
  billingDay: number | null
): string | null {
  const start = fromISODate(startDate);
  if (interval === "ONE_TIME") return toISODate(start);
  if (!billingDay) return toISODate(start);

  let candidate = new Date(start.getFullYear(), start.getMonth(), billingDay);
  if (candidate.getTime() < start.getTime()) {
    candidate = addInterval(candidate, interval, intervalCount);
    candidate = new Date(candidate.getFullYear(), candidate.getMonth(), billingDay);
  }
  return toISODate(candidate);
}

/* -------------------------------------------------------------------------- */
/* Validação                                                                   */
/* -------------------------------------------------------------------------- */

const subscriptionSchema = z
  .object({
    project_id: z.string().trim().min(1, "Selecione o projeto"),
    name: z.string().trim().min(2, "Informe o nome da recorrência"),
    description: z.string().trim().nullable(),
    amount: z.number().positive("Informe um valor maior que zero"),
    interval: z.enum(INTERVALS),
    interval_count: z.number().int().min(1, "Mínimo 1").max(24, "Máximo 24"),
    billing_day: z.number().int().min(1).max(28).nullable(),
    generate_days_before: z.number().int().min(0).max(60),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início"),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida")
      .nullable(),
    max_cycles: z.number().int().min(1).max(999).nullable(),
    auto_charge: z.boolean(),
    is_mandatory: z.boolean(),
    grace_days: z.number().int().min(0).max(90),
    late_fee_percent: z.number().min(0).max(100),
    interest_percent_month: z.number().min(0).max(100),
    payment_methods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1, "Selecione ao menos um meio de pagamento"),
  })
  .refine((data) => !data.end_date || data.end_date >= data.start_date, {
    message: "O fim precisa ser depois do início",
    path: ["end_date"],
  });

function parseSubscriptionForm(formData: FormData) {
  const f = readForm(formData);
  const billingDay = f.optional("billing_day");
  const endDate = f.optional("end_date");
  const maxCycles = f.optional("max_cycles");

  return subscriptionSchema.safeParse({
    project_id: f.str("project_id"),
    name: f.str("name"),
    description: f.optional("description"),
    amount: f.num("amount"),
    interval: f.str("interval") || "MONTHLY",
    interval_count: Math.round(f.num("interval_count", 1)) || 1,
    billing_day: billingDay ? Number(billingDay) : null,
    generate_days_before: Math.round(f.num("generate_days_before", 7)),
    start_date: f.str("start_date"),
    end_date: endDate,
    max_cycles: maxCycles ? Number(maxCycles) : null,
    auto_charge: f.bool("auto_charge"),
    is_mandatory: f.bool("is_mandatory"),
    grace_days: Math.round(f.num("grace_days", 3)),
    late_fee_percent: f.num("late_fee_percent", 2),
    interest_percent_month: f.num("interest_percent_month", 1),
    payment_methods: f.list("payment_methods"),
  });
}

/* -------------------------------------------------------------------------- */
/* Criar / atualizar                                                           */
/* -------------------------------------------------------------------------- */

export async function createSubscriptionAction(
  _prev: ActionResult<Subscription> | null,
  formData: FormData
): Promise<ActionResult<Subscription>> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const parsed = parseSubscriptionForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const data = parsed.data;

    const project = await must<Pick<Project, "id" | "customer_id" | "name" | "currency">>(
      db().from("projects").select("id, customer_id, name, currency").eq("id", data.project_id).single()
    );

    const nextBilling = computeNextBillingDate(
      data.start_date,
      data.interval,
      data.interval_count,
      data.billing_day
    );

    const subscription = await must<Subscription>(
      db()
        .from("subscriptions")
        .insert({
          project_id: project.id,
          customer_id: project.customer_id,
          name: data.name,
          description: data.description,
          amount: data.amount,
          currency: project.currency ?? "BRL",
          interval: data.interval,
          interval_count: data.interval_count,
          billing_day: data.billing_day,
          generate_days_before: data.generate_days_before,
          start_date: data.start_date,
          end_date: data.end_date,
          next_billing_date: nextBilling,
          max_cycles: data.max_cycles,
          auto_charge: data.auto_charge,
          is_mandatory: data.is_mandatory,
          grace_days: data.grace_days,
          late_fee_percent: data.late_fee_percent,
          interest_percent_month: data.interest_percent_month,
          payment_methods: data.payment_methods,
          status: "ACTIVE",
          created_by: user.id,
        })
        .select("*")
        .single()
    );

    await audit({
      action: "subscription.created",
      entityType: "subscription",
      entityId: subscription.id,
      entityLabel: subscription.name,
      after: subscription,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateSubscriptions(subscription.id);
    return ok(subscription, `Recorrência "${subscription.name}" criada.`);
  });
}

export async function updateSubscriptionAction(
  _prev: ActionResult<Subscription> | null,
  formData: FormData
): Promise<ActionResult<Subscription>> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Recorrência não identificada.");

    const parsed = parseSubscriptionForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const data = parsed.data;
    const before = await must<Subscription>(
      db().from("subscriptions").select("*").eq("id", id).single()
    );

    // Recalcula a próxima cobrança quando o ritmo muda; se não, preserva a agenda.
    const rhythmChanged =
      before.interval !== data.interval ||
      before.interval_count !== data.interval_count ||
      before.billing_day !== data.billing_day ||
      before.start_date !== data.start_date;

    const nextBilling = rhythmChanged
      ? computeNextBillingDate(data.start_date, data.interval, data.interval_count, data.billing_day)
      : before.next_billing_date;

    const subscription = await must<Subscription>(
      db()
        .from("subscriptions")
        .update({
          name: data.name,
          description: data.description,
          amount: data.amount,
          interval: data.interval,
          interval_count: data.interval_count,
          billing_day: data.billing_day,
          generate_days_before: data.generate_days_before,
          start_date: data.start_date,
          end_date: data.end_date,
          next_billing_date: nextBilling,
          max_cycles: data.max_cycles,
          auto_charge: data.auto_charge,
          is_mandatory: data.is_mandatory,
          grace_days: data.grace_days,
          late_fee_percent: data.late_fee_percent,
          interest_percent_month: data.interest_percent_month,
          payment_methods: data.payment_methods,
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "subscription.updated",
      entityType: "subscription",
      entityId: subscription.id,
      entityLabel: subscription.name,
      before,
      after: subscription,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateSubscriptions(id);
    return ok(subscription, "Recorrência atualizada.");
  });
}

/* -------------------------------------------------------------------------- */
/* Estados                                                                     */
/* -------------------------------------------------------------------------- */

async function setStatus(
  id: string,
  status: Subscription["status"],
  extra: Record<string, unknown>,
  action: string
): Promise<ActionResult> {
  const user = await assertPermission("billing:write");

  const subscription = await must<Subscription>(
    db()
      .from("subscriptions")
      .update({ status, ...extra })
      .eq("id", id)
      .select("*")
      .single()
  );

  await audit({
    action,
    entityType: "subscription",
    entityId: subscription.id,
    entityLabel: subscription.name,
    after: { status },
    actorId: user.id,
    actorLabel: user.name,
  });

  revalidateSubscriptions(id);
  return ok(null);
}

export async function pauseSubscriptionAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const result = await setStatus(id, "PAUSED", {}, "subscription.paused");
    if (!result.ok) return result;
    return ok(null, "Recorrência pausada. Nenhuma nova cobrança será gerada.");
  });
}

export async function resumeSubscriptionAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const before = await must<Subscription>(
      db().from("subscriptions").select("*").eq("id", id).single()
    );

    // Se a agenda ficou no passado durante a pausa, projeta a próxima data.
    const today = toISODate(new Date());
    let nextBilling = before.next_billing_date;
    if (!nextBilling || nextBilling < today) {
      nextBilling = computeNextBillingDate(
        today,
        before.interval,
        before.interval_count,
        before.billing_day
      );
    }

    const result = await setStatus(
      id,
      "ACTIVE",
      { next_billing_date: nextBilling, canceled_at: null, cancel_reason: null },
      "subscription.resumed"
    );
    if (!result.ok) return result;
    return ok(null, "Recorrência reativada.");
  });
}

export async function cancelSubscriptionAction(
  id: string,
  reason?: string | null
): Promise<ActionResult> {
  return run(async () => {
    const result = await setStatus(
      id,
      "CANCELED",
      {
        canceled_at: new Date().toISOString(),
        cancel_reason: reason?.trim() || null,
        next_billing_date: null,
      },
      "subscription.canceled"
    );
    if (!result.ok) return result;
    return ok(
      null,
      "Recorrência cancelada. As cobranças já emitidas continuam válidas."
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Geração manual das faturas do ciclo                                         */
/* -------------------------------------------------------------------------- */

export async function generateNowAction(): Promise<
  ActionResult<{ created: number; subscriptions: number }>
> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const { data, error } = await db().rpc("generate_subscription_invoices");
    if (error) return fail(error.message);

    const rows = (Array.isArray(data) ? data : data ? [data] : []) as {
      created_count?: number;
      subscription_ids?: string[] | null;
    }[];

    const created = rows.reduce((sum, row) => sum + Number(row.created_count ?? 0), 0);
    const ids = rows.flatMap((row) => row.subscription_ids ?? []);

    await audit({
      action: "subscription.invoices_generated",
      entityType: "subscription",
      entityLabel: `${created} cobrança(s)`,
      after: { created, subscription_ids: ids },
      actorId: user.id,
      actorLabel: user.name,
    });

    if (created > 0) {
      await notify({
        title: `${created} cobrança(s) gerada(s) pelas recorrências`,
        body: "Geração manual disparada pelo painel.",
        severity: "SUCCESS",
        category: "billing",
        actionUrl: "/cobrancas",
      });

      const { data: projects } = await db()
        .from("subscriptions")
        .select("project_id")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      for (const projectId of new Set((projects ?? []).map((p) => p.project_id as string))) {
        await flushEventsFor(projectId);
      }
    }

    revalidateSubscriptions();
    return ok(
      { created, subscriptions: new Set(ids).size },
      created > 0
        ? `${created} cobrança(s) gerada(s) a partir das recorrências.`
        : "Nenhuma recorrência está na janela de emissão hoje."
    );
  });
}
