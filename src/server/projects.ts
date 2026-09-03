"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { setProjectAccess } from "@/lib/billing";
import { deleteProjectRecord } from "@/lib/deletion-guards";
import { slugify } from "@/lib/utils";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { BlockMode, Project } from "@/lib/types";

const projectSchema = z.object({
  customer_id: z.string().uuid("Selecione o cliente responsável"),
  company_id: z.string().uuid().nullable(),
  name: z.string().trim().min(2, "Informe o nome do projeto"),
  slug: z
    .string()
    .trim()
    .min(2, "Informe o identificador")
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
  description: z.string().trim().nullable(),
  primary_domain: z.string().trim().nullable(),
  domains: z.array(z.string()),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Informe uma cor no formato #635BFF"),
  environment: z.enum(["TEST", "LIVE"]),
  monthly_amount: z.number().min(0, "Valor inválido"),
  contract_value: z.number().min(0, "Valor inválido"),
  block_mode: z.enum(["AUTO", "MANUAL"]),
  grace_days: z.number().int().min(0, "Mínimo 0 dias").max(90, "Máximo 90 dias"),
  started_at: z.string().trim().nullable(),
  default_due_day: z.number().int().min(1).max(28).nullable(),
  tags: z.array(z.string()),
  notes: z.string().trim().nullable(),
});

/** Os valores monetários chegam em centavos para não depender de locale. */
function cents(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function parseForm(formData: FormData) {
  const f = readForm(formData);
  const name = f.str("name");
  const dueDay = f.optional("default_due_day");

  return projectSchema.safeParse({
    customer_id: f.str("customer_id"),
    company_id: f.optional("company_id"),
    name,
    slug: slugify(f.str("slug") || name),
    description: f.optional("description"),
    primary_domain: f.optional("primary_domain")?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null,
    domains: f.csv("domains").map((d) => d.replace(/^https?:\/\//, "").replace(/\/$/, "")),
    color: f.str("color") || "#635BFF",
    environment: f.str("environment") || "LIVE",
    monthly_amount: cents(f.str("monthly_amount_cents")),
    contract_value: cents(f.str("contract_value_cents")),
    block_mode: f.str("block_mode") || "AUTO",
    grace_days: Number(f.str("grace_days") || 3),
    started_at: f.optional("started_at"),
    default_due_day: dueDay ? Number(dueDay) : null,
    tags: f.csv("tags"),
    notes: f.optional("notes"),
  });
}

/** Separa o que vai para colunas do que vive em `metadata`. */
function toRow(data: z.infer<typeof projectSchema>) {
  const { default_due_day, ...columns } = data;
  return { columns, metadata: { default_due_day } };
}

function revalidateProject(id?: string) {
  revalidatePath("/projetos");
  revalidatePath("/bloqueios");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/projetos/${id}`);
}

export async function createProjectAction(
  _prev: ActionResult<Project> | null,
  formData: FormData
): Promise<ActionResult<Project>> {
  return run(async () => {
    const user = await assertPermission("projects:write");
    const parsed = parseForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const { columns, metadata } = toRow(parsed.data);

    const project = await must<Project>(
      db()
        .from("projects")
        .insert({ ...columns, status: "ACTIVE", metadata, created_by: user.id })
        .select("*")
        .single()
    );

    await audit({
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      entityLabel: project.name,
      after: project,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(project.id);
    return ok(project, `Projeto ${project.name} criado.`);
  });
}

export async function updateProjectAction(
  _prev: ActionResult<Project> | null,
  formData: FormData
): Promise<ActionResult<Project>> {
  return run(async () => {
    const user = await assertPermission("projects:write");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Projeto não identificado.");

    const parsed = parseForm(formData);
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const before = await must<Project>(db().from("projects").select("*").eq("id", id).single());
    const { columns, metadata } = toRow(parsed.data);

    const project = await must<Project>(
      db()
        .from("projects")
        .update({ ...columns, metadata: { ...before.metadata, ...metadata } })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      entityLabel: project.name,
      before,
      after: project,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(id);
    return ok(project, "Projeto atualizado.");
  });
}

export async function archiveProjectAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:write");

    const { count } = await db()
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .in("status", ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"]);

    if ((count ?? 0) > 0) {
      return fail(
        `Este projeto possui ${count} cobrança(s) em aberto. Quite ou cancele antes de arquivar.`
      );
    }

    const project = await must<Project>(
      db()
        .from("projects")
        .update({ status: "ARCHIVED", ends_at: new Date().toISOString().slice(0, 10) })
        .eq("id", id)
        .select("*")
        .single()
    );

    await db().from("api_keys").update({ status: "REVOKED", revoked_at: new Date().toISOString() })
      .eq("project_id", id)
      .eq("status", "ACTIVE");

    await audit({
      action: "project.archived",
      entityType: "project",
      entityId: id,
      entityLabel: project.name,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(id);
    return ok(null, "Projeto arquivado e credenciais revogadas.");
  });
}

export async function blockProjectAction(id: string, reason?: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:block");
    const project = await setProjectAccess({
      projectId: id,
      action: "BLOCK",
      reason: reason?.trim() || "Bloqueio manual pelo administrador",
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(id);
    return ok(null, `Acesso de ${project.name} bloqueado.`);
  });
}

export async function unblockProjectAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:block");
    const project = await setProjectAccess({
      projectId: id,
      action: "ACTIVATE",
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(id);
    return ok(null, `Acesso de ${project.name} liberado.`);
  });
}

export async function suspendProjectAction(id: string, reason?: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:block");
    const project = await setProjectAccess({
      projectId: id,
      action: "SUSPEND",
      reason: reason?.trim() || "Suspensão manual pelo administrador",
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(id);
    return ok(null, `Projeto ${project.name} suspenso.`);
  });
}

export async function toggleBlockModeAction(
  id: string,
  mode: BlockMode
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:block");

    const before = await must<Project>(
      db().from("projects").select("*").eq("id", id).single()
    );

    const project = await must<Project>(
      db().from("projects").update({ block_mode: mode }).eq("id", id).select("*").single()
    );

    await audit({
      action: "project.block_mode_changed",
      entityType: "project",
      entityId: id,
      entityLabel: project.name,
      before: { block_mode: before.block_mode },
      after: { block_mode: mode },
      actorId: user.id,
      actorLabel: user.name,
    });

    // No modo automático o status precisa refletir imediatamente a inadimplência.
    if (mode === "AUTO") {
      await db().rpc("refresh_project_access", { p_project_id: id });
    }

    revalidateProject(id);
    return ok(null, mode === "AUTO" ? "Bloqueio automático ativado." : "Bloqueio agora é manual.");
  });
}

export async function updateGraceDaysAction(id: string, days: number): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:block");

    const value = Math.round(Number(days));
    if (!Number.isFinite(value) || value < 0 || value > 90) {
      return fail("A carência precisa estar entre 0 e 90 dias.");
    }

    const before = await must<Project>(
      db().from("projects").select("*").eq("id", id).single()
    );

    const project = await must<Project>(
      db().from("projects").update({ grace_days: value }).eq("id", id).select("*").single()
    );

    await audit({
      action: "project.grace_days_changed",
      entityType: "project",
      entityId: id,
      entityLabel: project.name,
      before: { grace_days: before.grace_days },
      after: { grace_days: value },
      actorId: user.id,
      actorLabel: user.name,
    });

    await db().rpc("refresh_project_access", { p_project_id: id });

    revalidateProject(id);
    return ok(null, `Carência ajustada para ${value} dia(s).`);
  });
}

export async function deleteProjectAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("projects:write");

    const project = await must<Project>(
      db().from("projects").select("*").eq("id", id).single()
    );

    const result = await deleteProjectRecord(id);
    if (!result.ok) return fail(result.message);

    await audit({
      action: "project.deleted",
      entityType: "project",
      entityId: id,
      entityLabel: project.name,
      before: { code: project.code, name: project.name, customer_id: project.customer_id },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateProject(id);
    revalidatePath("/clientes");
    return ok(null, "Projeto excluído permanentemente.");
  });
}
