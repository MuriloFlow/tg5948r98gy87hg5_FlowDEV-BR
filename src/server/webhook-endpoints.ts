"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { generateWebhookSecret } from "@/lib/api-keys";
import { dispatchEvent, replayDelivery } from "@/lib/webhooks";
import { WEBHOOK_EVENT_TYPES } from "@/lib/types";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { WebhookEndpoint } from "@/lib/types";

const EVENT_SET = new Set<string>(WEBHOOK_EVENT_TYPES);

const endpointSchema = z.object({
  project_id: z.string().uuid("Selecione o projeto"),
  url: z
    .string()
    .trim()
    .url("Informe uma URL válida (https://...)")
    .refine((v) => v.startsWith("https://") || v.startsWith("http://localhost"), {
      message: "Use HTTPS (http só é aceito em localhost)",
    }),
  description: z.string().trim().nullable(),
  events: z.array(z.string()).min(1, "Selecione ao menos um evento"),
});

function readEvents(formData: FormData): string[] {
  return readForm(formData)
    .list("events")
    .filter((type) => EVENT_SET.has(type));
}

function revalidateWebhooks(projectId?: string) {
  revalidatePath("/webhooks");
  if (projectId) revalidatePath(`/projetos/${projectId}`);
}

export async function createWebhookEndpointAction(
  _prev: ActionResult<WebhookEndpoint> | null,
  formData: FormData
): Promise<ActionResult<WebhookEndpoint>> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");
    const f = readForm(formData);

    const parsed = endpointSchema.safeParse({
      project_id: f.str("project_id"),
      url: f.str("url"),
      description: f.optional("description"),
      events: readEvents(formData),
    });

    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const endpoint = await must<WebhookEndpoint>(
      db()
        .from("webhook_endpoints")
        .insert({
          ...parsed.data,
          secret: generateWebhookSecret(),
          status: "ACTIVE",
          created_by: user.id,
        })
        .select("*")
        .single()
    );

    await audit({
      action: "webhook_endpoint.created",
      entityType: "webhook_endpoint",
      entityId: endpoint.id,
      entityLabel: endpoint.url,
      after: { url: endpoint.url, events: endpoint.events },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks(endpoint.project_id);
    return ok(endpoint, "Endpoint criado. Guarde o signing secret com segurança.");
  });
}

export async function updateWebhookEndpointAction(
  _prev: ActionResult<WebhookEndpoint> | null,
  formData: FormData
): Promise<ActionResult<WebhookEndpoint>> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Endpoint não identificado.");

    const f = readForm(formData);
    const parsed = endpointSchema.safeParse({
      project_id: f.str("project_id"),
      url: f.str("url"),
      description: f.optional("description"),
      events: readEvents(formData),
    });

    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const before = await must<WebhookEndpoint>(
      db().from("webhook_endpoints").select("*").eq("id", id).single()
    );

    const endpoint = await must<WebhookEndpoint>(
      db()
        .from("webhook_endpoints")
        .update({
          url: parsed.data.url,
          description: parsed.data.description,
          events: parsed.data.events,
          // uma URL nova zera o histórico de falhas consecutivas
          ...(parsed.data.url !== before.url ? { consecutive_failures: 0 } : {}),
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "webhook_endpoint.updated",
      entityType: "webhook_endpoint",
      entityId: id,
      entityLabel: endpoint.url,
      before: { url: before.url, events: before.events },
      after: { url: endpoint.url, events: endpoint.events },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks(endpoint.project_id);
    return ok(endpoint, "Endpoint atualizado.");
  });
}

export async function deleteWebhookEndpointAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");

    const before = await must<WebhookEndpoint>(
      db().from("webhook_endpoints").select("*").eq("id", id).single()
    );

    const { error } = await db().from("webhook_endpoints").delete().eq("id", id);
    if (error) return fail(error.message);

    await audit({
      action: "webhook_endpoint.deleted",
      entityType: "webhook_endpoint",
      entityId: id,
      entityLabel: before.url,
      before: { url: before.url, events: before.events },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks(before.project_id);
    return ok(null, "Endpoint removido junto com o histórico de entregas.");
  });
}

export async function toggleWebhookEndpointAction(
  id: string,
  enabled: boolean
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");

    const endpoint = await must<WebhookEndpoint>(
      db()
        .from("webhook_endpoints")
        .update({
          status: enabled ? "ACTIVE" : "DISABLED",
          ...(enabled ? { consecutive_failures: 0 } : {}),
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: enabled ? "webhook_endpoint.enabled" : "webhook_endpoint.disabled",
      entityType: "webhook_endpoint",
      entityId: id,
      entityLabel: endpoint.url,
      after: { status: endpoint.status },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks(endpoint.project_id);
    return ok(null, enabled ? "Endpoint reativado." : "Endpoint desativado.");
  });
}

export async function replayDeliveryAction(deliveryId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");

    const success = await replayDelivery(deliveryId);

    await audit({
      action: "webhook_delivery.replayed",
      entityType: "webhook_delivery",
      entityId: deliveryId,
      after: { success },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks();
    return success
      ? ok(null, "Evento reenviado e confirmado pelo endpoint.")
      : fail("O endpoint não confirmou o reenvio. Veja os detalhes da entrega.");
  });
}

export async function rotateWebhookSecretAction(id: string): Promise<ActionResult<string>> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");

    const endpoint = await must<WebhookEndpoint>(
      db()
        .from("webhook_endpoints")
        .update({ secret: generateWebhookSecret() })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "webhook_endpoint.secret_rotated",
      entityType: "webhook_endpoint",
      entityId: id,
      entityLabel: endpoint.url,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks(endpoint.project_id);
    return ok(endpoint.secret, "Secret rotacionado. Atualize a verificação no seu servidor.");
  });
}

/** Dispara um `payment.paid` sintético para validar a integração ponta a ponta. */
export async function sendTestEventAction(projectId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("webhooks:manage");

    const { data: project } = await db()
      .from("projects")
      .select("id, name, customer_id")
      .eq("id", projectId)
      .maybeSingle();

    if (!project) return fail("Projeto não encontrado.");

    const event = await must<{ id: string }>(
      db()
        .from("events")
        .insert({
          type: "payment.paid",
          project_id: project.id,
          customer_id: project.customer_id,
          resource_type: "invoice",
          payload: {
            test: true,
            code: "INV-TESTE-000001",
            description: "Evento de teste enviado pelo painel FlowDesk",
            total: 149.9,
            currency: "BRL",
            paid_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single()
    );

    const result = await dispatchEvent(event.id);

    await audit({
      action: "webhook.test_event_sent",
      entityType: "project",
      entityId: project.id,
      entityLabel: project.name as string,
      after: result,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateWebhooks(project.id);

    if (result.delivered === 0 && result.failed === 0) {
      return fail("Nenhum endpoint ativo assina o evento payment.paid neste projeto.");
    }

    return result.failed > 0
      ? fail(`${result.failed} endpoint(s) não confirmaram o recebimento. Veja as entregas abaixo.`)
      : ok(null, `Evento de teste entregue a ${result.delivered} endpoint(s).`);
  });
}
