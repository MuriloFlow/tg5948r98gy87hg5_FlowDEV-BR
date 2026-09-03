import "server-only";

import { db } from "./db";

const SETTLED_PAYMENT_STATUSES = [
  "APPROVED",
  "AUTHORIZED",
  "REFUNDED",
  "CHARGED_BACK",
  "IN_MEDIATION",
] as const;

export interface DeletionBlockers {
  invoices: number;
  settledPayments: number;
}

export async function projectDeletionBlockers(projectId: string): Promise<DeletionBlockers> {
  const [invoices, payments] = await Promise.all([
    db()
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    db()
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", [...SETTLED_PAYMENT_STATUSES]),
  ]);

  return {
    invoices: invoices.count ?? 0,
    settledPayments: payments.count ?? 0,
  };
}

export async function customerDeletionBlockers(customerId: string): Promise<DeletionBlockers> {
  const [invoices, payments] = await Promise.all([
    db()
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId),
    db()
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("status", [...SETTLED_PAYMENT_STATUSES]),
  ]);

  return {
    invoices: invoices.count ?? 0,
    settledPayments: payments.count ?? 0,
  };
}

function blockersMessage(scope: "projeto" | "cliente", blockers: DeletionBlockers): string | null {
  if (blockers.invoices > 0) {
    return `Não é possível excluir: ${
      scope === "cliente" ? "este cliente possui" : "este projeto possui"
    } ${blockers.invoices} cobrança(s) no histórico. Arquive para preservar a auditoria financeira.`;
  }
  if (blockers.settledPayments > 0) {
    return `Existem pagamentos confirmados vinculados a ${
      scope === "cliente" ? "este cliente" : "este projeto"
    }. Arquive em vez de excluir.`;
  }
  return null;
}

/** Remove um projeto sem histórico financeiro confirmado. */
export async function deleteProjectRecord(
  projectId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const blockers = await projectDeletionBlockers(projectId);
  const message = blockersMessage("projeto", blockers);
  if (message) return { ok: false, message };

  // tentativas que nunca liquidaram não bloqueiam a exclusão
  await db().from("payments").delete().eq("project_id", projectId);

  const { error } = await db().from("projects").delete().eq("id", projectId);
  if (error) return { ok: false, message: error.message };

  return { ok: true };
}

/** Remove o cliente e, quando permitido, os projetos vinculados. */
export async function deleteCustomerRecord(
  customerId: string
): Promise<{ ok: true; projectsRemoved: number } | { ok: false; message: string }> {
  const blockers = await customerDeletionBlockers(customerId);
  const message = blockersMessage("cliente", blockers);
  if (message) return { ok: false, message };

  const { data: projects } = await db()
    .from("projects")
    .select("id")
    .eq("customer_id", customerId);

  for (const project of projects ?? []) {
    const result = await deleteProjectRecord(project.id as string);
    if (!result.ok) {
      return {
        ok: false,
        message: `${result.message} Remova ou arquive os projetos antes de excluir o cliente.`,
      };
    }
  }

  const { error } = await db().from("customers").delete().eq("id", customerId);
  if (error) return { ok: false, message: error.message };

  return { ok: true, projectsRemoved: projects?.length ?? 0 };
}
