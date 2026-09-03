"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { deleteCustomerRecord } from "@/lib/deletion-guards";
import { onlyDigits, isValidDocument } from "@/lib/utils";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { Customer } from "@/lib/types";

const customerSchema = z.object({
  type: z.enum(["PF", "PJ"]),
  name: z.string().trim().min(2, "Informe o nome"),
  legal_name: z.string().trim().nullable(),
  document: z
    .string()
    .trim()
    .nullable()
    .refine((v) => !v || isValidDocument(v), "CPF ou CNPJ inválido"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: z.string().trim().nullable(),
  whatsapp: z.string().trim().nullable(),
  website: z.string().trim().nullable(),
  zip_code: z.string().trim().nullable(),
  street: z.string().trim().nullable(),
  number: z.string().trim().nullable(),
  complement: z.string().trim().nullable(),
  district: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  state: z.string().trim().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  default_due_day: z.number().int().min(1).max(28).nullable(),
  notes: z.string().trim().nullable(),
  tags: z.array(z.string()),
});

function parseForm(formData: FormData) {
  const f = readForm(formData);
  const dueDay = f.optional("default_due_day");

  return customerSchema.safeParse({
    type: f.str("type") || "PJ",
    name: f.str("name"),
    legal_name: f.optional("legal_name"),
    document: f.optional("document"),
    email: f.str("email"),
    phone: f.optional("phone"),
    whatsapp: f.optional("whatsapp"),
    website: f.optional("website"),
    zip_code: f.optional("zip_code"),
    street: f.optional("street"),
    number: f.optional("number"),
    complement: f.optional("complement"),
    district: f.optional("district"),
    city: f.optional("city"),
    state: f.optional("state"),
    status: f.str("status") || "ACTIVE",
    default_due_day: dueDay ? Number(dueDay) : null,
    notes: f.optional("notes"),
    tags: f.csv("tags"),
  });
}

export async function createCustomerAction(
  _prev: ActionResult<Customer> | null,
  formData: FormData
): Promise<ActionResult<Customer>> {
  return run(async () => {
    const user = await assertPermission("customers:write");
    const parsed = parseForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const payload = {
      ...parsed.data,
      document: parsed.data.document ? onlyDigits(parsed.data.document) : null,
      state: parsed.data.state ? parsed.data.state.toUpperCase().slice(0, 2) : null,
      zip_code: parsed.data.zip_code ? onlyDigits(parsed.data.zip_code) : null,
      created_by: user.id,
    };

    const customer = await must<Customer>(
      db().from("customers").insert(payload).select("*").single()
    );

    await audit({
      action: "customer.created",
      entityType: "customer",
      entityId: customer.id,
      entityLabel: customer.name,
      after: customer,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/clientes");
    revalidatePath("/dashboard");
    return ok(customer, `Cliente ${customer.name} cadastrado.`);
  });
}

export async function updateCustomerAction(
  _prev: ActionResult<Customer> | null,
  formData: FormData
): Promise<ActionResult<Customer>> {
  return run(async () => {
    const user = await assertPermission("customers:write");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Cliente não identificado.");

    const parsed = parseForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const before = await must<Customer>(
      db().from("customers").select("*").eq("id", id).single()
    );

    const customer = await must<Customer>(
      db()
        .from("customers")
        .update({
          ...parsed.data,
          document: parsed.data.document ? onlyDigits(parsed.data.document) : null,
          state: parsed.data.state ? parsed.data.state.toUpperCase().slice(0, 2) : null,
          zip_code: parsed.data.zip_code ? onlyDigits(parsed.data.zip_code) : null,
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "customer.updated",
      entityType: "customer",
      entityId: customer.id,
      entityLabel: customer.name,
      before,
      after: customer,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    return ok(customer, "Cliente atualizado.");
  });
}

export async function archiveCustomerAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers:write");

    const { count } = await db()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id)
      .neq("status", "ARCHIVED");

    if ((count ?? 0) > 0) {
      return fail(
        `Este cliente possui ${count} projeto(s) ativo(s). Arquive os projetos antes de arquivar o cliente.`
      );
    }

    const customer = await must<Customer>(
      db().from("customers").update({ status: "ARCHIVED" }).eq("id", id).select("*").single()
    );

    await audit({
      action: "customer.archived",
      entityType: "customer",
      entityId: id,
      entityLabel: customer.name,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/clientes");
    return ok(null, "Cliente arquivado.");
  });
}

export async function restoreCustomerAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers:write");
    await db().from("customers").update({ status: "ACTIVE" }).eq("id", id);
    await audit({
      action: "customer.restored",
      entityType: "customer",
      entityId: id,
      actorId: user.id,
      actorLabel: user.name,
    });
    revalidatePath("/clientes");
    return ok(null, "Cliente reativado.");
  });
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers:write");

    const { data: customer } = await db()
      .from("customers")
      .select("name")
      .eq("id", id)
      .maybeSingle();

    const result = await deleteCustomerRecord(id);
    if (!result.ok) return fail(result.message);

    await audit({
      action: "customer.deleted",
      entityType: "customer",
      entityId: id,
      entityLabel: customer?.name ?? null,
      after: { projects_removed: result.projectsRemoved },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/clientes");
    revalidatePath("/projetos");
    revalidatePath("/dashboard");

    const suffix =
      result.projectsRemoved > 0
        ? ` ${result.projectsRemoved} projeto(s) vinculado(s) também foram removidos.`
        : "";

    return ok(null, `Cliente excluído.${suffix}`);
  });
}
