"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { onlyDigits } from "@/lib/utils";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";

/** Valores monetários trafegam em centavos para não depender de locale. */
function cents(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

/* ========================================================================== */
/* DESPESAS                                                                    */
/* ========================================================================== */

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

const expenseSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição"),
  category: z.string().trim().min(2, "Informe a categoria"),
  amount: z.number().min(0, "Valor inválido"),
  project_id: z.string().uuid().nullable(),
  due_date: z.string().trim().nullable(),
  paid_at: z.string().trim().nullable(),
  is_recurring: z.boolean(),
  interval: z.enum(INTERVALS).nullable(),
  notes: z.string().trim().nullable(),
});

function parseExpense(formData: FormData) {
  const f = readForm(formData);
  const recurring = f.bool("is_recurring");
  const paidAt = f.optional("paid_at");

  return expenseSchema.safeParse({
    description: f.str("description"),
    category: f.str("category") || "infra",
    amount: cents(f.str("amount_cents")),
    project_id: f.optional("project_id"),
    due_date: f.optional("due_date"),
    paid_at: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : null,
    is_recurring: recurring,
    interval: recurring ? f.str("interval") || "MONTHLY" : null,
    notes: f.optional("notes"),
  });
}

function revalidateExpenses() {
  revalidatePath("/despesas");
  revalidatePath("/fluxo-caixa");
  revalidatePath("/metricas");
}

export async function createExpenseAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const parsed = parseExpense(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const expense = await must<{ id: string; description: string }>(
      db()
        .from("expenses")
        .insert({ ...parsed.data, created_by: user.id })
        .select("id, description")
        .single()
    );

    await audit({
      action: "expense.created",
      entityType: "expense",
      entityId: expense.id,
      entityLabel: expense.description,
      after: parsed.data,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateExpenses();
    return ok(null, "Despesa lançada.");
  });
}

export async function updateExpenseAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Despesa não identificada.");

    const parsed = parseExpense(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const { data: before } = await db().from("expenses").select("*").eq("id", id).maybeSingle();

    const expense = await must<{ id: string; description: string }>(
      db().from("expenses").update(parsed.data).eq("id", id).select("id, description").single()
    );

    await audit({
      action: "expense.updated",
      entityType: "expense",
      entityId: expense.id,
      entityLabel: expense.description,
      before,
      after: parsed.data,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateExpenses();
    return ok(null, "Despesa atualizada.");
  });
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const { data: before } = await db()
      .from("expenses")
      .select("description")
      .eq("id", id)
      .maybeSingle();

    const { error } = await db().from("expenses").delete().eq("id", id);
    if (error) return fail(error.message);

    await audit({
      action: "expense.deleted",
      entityType: "expense",
      entityId: id,
      entityLabel: before?.description ?? null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateExpenses();
    return ok(null, "Despesa excluída.");
  });
}

export async function markExpensePaidAction(
  id: string,
  paid = true
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const expense = await must<{ id: string; description: string }>(
      db()
        .from("expenses")
        .update({ paid_at: paid ? new Date().toISOString() : null })
        .eq("id", id)
        .select("id, description")
        .single()
    );

    await audit({
      action: paid ? "expense.paid" : "expense.unpaid",
      entityType: "expense",
      entityId: id,
      entityLabel: expense.description,
      after: { paid },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateExpenses();
    return ok(null, paid ? "Despesa marcada como paga." : "Baixa da despesa desfeita.");
  });
}

/* ========================================================================== */
/* CUPONS                                                                      */
/* ========================================================================== */

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "O código precisa ter ao menos 3 caracteres")
    .regex(/^[A-Z0-9-]+$/, "Use apenas letras, números e hífen"),
  description: z.string().trim().nullable(),
  discount_type: z.enum(["PERCENT", "FIXED"]),
  discount_value: z.number().gt(0, "O desconto precisa ser maior que zero"),
  max_redemptions: z.number().int().min(1, "Mínimo de 1 resgate").nullable(),
  valid_from: z.string().min(1, "Informe o início da validade"),
  valid_until: z.string().nullable(),
  is_active: z.boolean(),
});

function parseCoupon(formData: FormData) {
  const f = readForm(formData);
  const type = f.str("discount_type") || "PERCENT";
  const limit = f.optional("max_redemptions");
  const from = f.optional("valid_from");
  const until = f.optional("valid_until");

  return couponSchema.safeParse({
    code: f.str("code"),
    description: f.optional("description"),
    discount_type: type,
    discount_value:
      type === "PERCENT" ? Number(f.str("percent_value").replace(",", ".")) : cents(f.str("amount_cents")),
    max_redemptions: limit ? Number(limit) : null,
    valid_from: from ? new Date(`${from}T00:00:00`).toISOString() : new Date().toISOString(),
    valid_until: until ? new Date(`${until}T23:59:59`).toISOString() : null,
    is_active: f.bool("is_active"),
  });
}

export async function createCouponAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");
    const parsed = parseCoupon(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    if (parsed.data.discount_type === "PERCENT" && parsed.data.discount_value > 100) {
      return fail("Revise os campos destacados.", {
        discount_value: "O desconto percentual não pode passar de 100%",
      });
    }

    const id = String(formData.get("id") ?? "");

    const coupon = id
      ? await must<{ id: string; code: string }>(
          db().from("coupons").update(parsed.data).eq("id", id).select("id, code").single()
        )
      : await must<{ id: string; code: string }>(
          db().from("coupons").insert(parsed.data).select("id, code").single()
        );

    await audit({
      action: id ? "coupon.updated" : "coupon.created",
      entityType: "coupon",
      entityId: coupon.id,
      entityLabel: coupon.code,
      after: parsed.data,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/cupons");
    return ok(null, id ? `Cupom ${coupon.code} atualizado.` : `Cupom ${coupon.code} criado.`);
  });
}

export async function toggleCouponAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const coupon = await must<{ id: string; code: string }>(
      db().from("coupons").update({ is_active: active }).eq("id", id).select("id, code").single()
    );

    await audit({
      action: active ? "coupon.activated" : "coupon.deactivated",
      entityType: "coupon",
      entityId: id,
      entityLabel: coupon.code,
      after: { is_active: active },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/cupons");
    return ok(null, active ? `Cupom ${coupon.code} ativado.` : `Cupom ${coupon.code} desativado.`);
  });
}

export async function deleteCouponAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing:write");

    const { data: before } = await db().from("coupons").select("code, redemptions").eq("id", id).maybeSingle();

    if ((before?.redemptions ?? 0) > 0) {
      return fail(
        "Este cupom já foi resgatado. Desative-o para preservar o histórico em vez de excluí-lo."
      );
    }

    const { error } = await db().from("coupons").delete().eq("id", id);
    if (error) return fail(error.message);

    await audit({
      action: "coupon.deleted",
      entityType: "coupon",
      entityId: id,
      entityLabel: before?.code ?? null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/cupons");
    return ok(null, "Cupom excluído.");
  });
}

/* ========================================================================== */
/* EMPRESAS (pessoa jurídica vinculada a um cliente)                           */
/* ========================================================================== */

const companySchema = z.object({
  customer_id: z.string().uuid("Selecione o cliente responsável"),
  legal_name: z.string().trim().min(2, "Informe a razão social"),
  trade_name: z.string().trim().nullable(),
  cnpj: z
    .string()
    .trim()
    .nullable()
    .refine((v) => !v || onlyDigits(v).length === 14, "CNPJ deve ter 14 dígitos"),
  state_registration: z.string().trim().nullable(),
  municipal_registration: z.string().trim().nullable(),
  email: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  website: z.string().trim().nullable(),
  logo_url: z.string().trim().nullable(),
  zip_code: z.string().trim().nullable(),
  street: z.string().trim().nullable(),
  number: z.string().trim().nullable(),
  complement: z.string().trim().nullable(),
  district: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  state: z.string().trim().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  notes: z.string().trim().nullable(),
});

function parseCompany(formData: FormData) {
  const f = readForm(formData);

  return companySchema.safeParse({
    customer_id: f.str("customer_id"),
    legal_name: f.str("legal_name"),
    trade_name: f.optional("trade_name"),
    cnpj: f.optional("cnpj"),
    state_registration: f.optional("state_registration"),
    municipal_registration: f.optional("municipal_registration"),
    email: f.optional("email"),
    phone: f.optional("phone"),
    website: f.optional("website"),
    logo_url: f.optional("logo_url"),
    zip_code: f.optional("zip_code"),
    street: f.optional("street"),
    number: f.optional("number"),
    complement: f.optional("complement"),
    district: f.optional("district"),
    city: f.optional("city"),
    state: f.optional("state"),
    status: f.str("status") || "ACTIVE",
    notes: f.optional("notes"),
  });
}

function normalizeCompany(data: z.infer<typeof companySchema>) {
  return {
    ...data,
    cnpj: data.cnpj ? onlyDigits(data.cnpj) : null,
    zip_code: data.zip_code ? onlyDigits(data.zip_code) : null,
    state: data.state ? data.state.toUpperCase().slice(0, 2) : null,
  };
}

export async function createCompanyAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers:write");
    const parsed = parseCompany(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const payload = normalizeCompany(parsed.data);

    const company = await must<{ id: string; legal_name: string }>(
      db().from("companies").insert(payload).select("id, legal_name").single()
    );

    await audit({
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      entityLabel: company.legal_name,
      after: payload,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/empresas");
    return ok(null, `Empresa ${company.legal_name} cadastrada.`);
  });
}

export async function updateCompanyAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers:write");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Empresa não identificada.");

    const parsed = parseCompany(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const { data: before } = await db().from("companies").select("*").eq("id", id).maybeSingle();
    const payload = normalizeCompany(parsed.data);

    const company = await must<{ id: string; legal_name: string }>(
      db().from("companies").update(payload).eq("id", id).select("id, legal_name").single()
    );

    await audit({
      action: "company.updated",
      entityType: "company",
      entityId: company.id,
      entityLabel: company.legal_name,
      before,
      after: payload,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/empresas");
    return ok(null, "Empresa atualizada.");
  });
}

export async function deleteCompanyAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers:write");

    const { count } = await db()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id);

    if ((count ?? 0) > 0) {
      return fail(
        `Esta empresa está vinculada a ${count} projeto(s). Desvincule-os antes de excluir.`
      );
    }

    const { data: before } = await db()
      .from("companies")
      .select("legal_name")
      .eq("id", id)
      .maybeSingle();

    const { error } = await db().from("companies").delete().eq("id", id);
    if (error) return fail(error.message);

    await audit({
      action: "company.deleted",
      entityType: "company",
      entityId: id,
      entityLabel: before?.legal_name ?? null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/empresas");
    return ok(null, "Empresa excluída.");
  });
}
