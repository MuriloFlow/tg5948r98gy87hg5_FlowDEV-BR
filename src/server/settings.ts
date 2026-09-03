"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { testCredentials } from "@/lib/mercadopago";
import { syncMercadoPagoPayment } from "@/lib/payment-sync";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";

/* -------------------------------------------------------------------------- */
/* Chave/valor da tabela `settings`                                            */
/* -------------------------------------------------------------------------- */

const SETTING_KEY = /^[a-z0-9_.-]{2,60}$/;

export async function upsertSettingAction(
  key: string,
  value: unknown
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("settings:manage");

    if (!SETTING_KEY.test(key)) return fail("Chave de configuração inválida.");

    const { data: before } = await db()
      .from("settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    await must(
      db()
        .from("settings")
        .upsert({
          key,
          value: (value ?? {}) as object,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .select("key")
        .single()
    );

    await audit({
      action: "settings.updated",
      entityType: "setting",
      entityLabel: key,
      before: before?.value ?? null,
      after: value,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/configuracoes");
    revalidatePath("/gateways");
    return ok(null, "Configuração salva.");
  });
}

/* -------------------------------------------------------------------------- */
/* Gateway de pagamento                                                        */
/* -------------------------------------------------------------------------- */

export async function testGatewayAction(): Promise<
  ActionResult<{ connected: boolean; message: string }>
> {
  return run(async () => {
    const user = await assertPermission("settings:manage");
    const result = await testCredentials();

    await audit({
      action: "gateway.connection_tested",
      entityType: "gateway",
      entityLabel: "mercadopago",
      after: { ok: result.ok, message: result.message },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/gateways");
    return ok({ connected: result.ok, message: result.message }, result.message);
  });
}

/** Reprocessa um webhook recebido do gateway (útil quando a sincronia falhou). */
export async function reprocessGatewayWebhookAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("settings:manage");

    const webhook = await must<{ id: string; external_id: string | null }>(
      db().from("gateway_webhooks").select("id, external_id").eq("id", id).single()
    );

    if (!webhook.external_id) {
      return fail("Este webhook não traz o identificador do pagamento no gateway.");
    }

    try {
      const result = await syncMercadoPagoPayment(webhook.external_id);

      await db()
        .from("gateway_webhooks")
        .update({
          processed: result.status === "synced",
          processed_at: new Date().toISOString(),
          process_error: result.status === "synced" ? null : (result.reason ?? null),
        })
        .eq("id", id);

      await audit({
        action: "gateway.webhook_reprocessed",
        entityType: "gateway_webhook",
        entityId: id,
        entityLabel: webhook.external_id,
        after: result as unknown as Record<string, unknown>,
        actorId: user.id,
        actorLabel: user.name,
      });

      revalidatePath("/gateways");

      if (result.status === "ignored") {
        return fail(result.reason ?? "O gateway não reconheceu este pagamento.");
      }
      return ok(null, "Webhook reprocessado com sucesso.");
    } catch (error) {
      await db()
        .from("gateway_webhooks")
        .update({ process_error: (error as Error).message })
        .eq("id", id);
      revalidatePath("/gateways");
      throw error;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Modelos de mensagem                                                         */
/* -------------------------------------------------------------------------- */

const templateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, "Informe a chave do modelo")
    .regex(/^[a-z0-9_.-]+$/, "Use apenas letras minúsculas, números, ponto, hífen e underscore"),
  channel: z.enum(["email", "whatsapp", "sms"]),
  name: z.string().trim().min(2, "Informe o nome do modelo"),
  subject: z.string().trim().nullable(),
  body: z.string().trim().min(4, "Escreva o corpo da mensagem"),
  variables: z.array(z.string()),
  is_active: z.boolean(),
});

/** Extrai `{{variavel}}` do corpo e do assunto para gravar em `variables`. */
function extractVariables(...parts: (string | null)[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    for (const match of (part ?? "").matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
      found.add(match[1].toLowerCase());
    }
  }
  return [...found];
}

export async function saveTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("settings:manage");
    const f = readForm(formData);
    const id = f.optional("id");

    const subject = f.optional("subject");
    const body = f.str("body");

    const parsed = templateSchema.safeParse({
      key: f.str("key"),
      channel: f.str("channel") || "email",
      name: f.str("name"),
      subject,
      body,
      variables: extractVariables(subject, body),
      is_active: f.bool("is_active"),
    });
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    if (parsed.data.channel === "email" && !parsed.data.subject) {
      return fail("Revise os campos destacados.", {
        subject: "O assunto é obrigatório para e-mails",
      });
    }

    const saved = id
      ? await must<{ id: string; name: string }>(
          db()
            .from("message_templates")
            .update(parsed.data)
            .eq("id", id)
            .select("id, name")
            .single()
        )
      : await must<{ id: string; name: string }>(
          db().from("message_templates").insert(parsed.data).select("id, name").single()
        );

    await audit({
      action: id ? "template.updated" : "template.created",
      entityType: "message_template",
      entityId: saved.id,
      entityLabel: saved.name,
      after: parsed.data,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/modelos");
    return ok(null, id ? "Modelo atualizado." : "Modelo criado.");
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("settings:manage");

    const { data: before } = await db()
      .from("message_templates")
      .select("name")
      .eq("id", id)
      .maybeSingle();

    const { error } = await db().from("message_templates").delete().eq("id", id);
    if (error) return fail(error.message);

    await audit({
      action: "template.deleted",
      entityType: "message_template",
      entityId: id,
      entityLabel: before?.name ?? null,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidatePath("/modelos");
    return ok(null, "Modelo excluído.");
  });
}

/* -------------------------------------------------------------------------- */
/* Central de notificações                                                     */
/* -------------------------------------------------------------------------- */

async function requireSession() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
  return user;
}

export async function markNotificationReadAction(
  id: string,
  read = true
): Promise<ActionResult> {
  return run(async () => {
    await requireSession();

    const { error } = await db()
      .from("notifications")
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq("id", id);

    if (error) return fail(error.message);

    revalidatePath("/notificacoes");
    return ok(null, read ? "Notificação marcada como lida." : "Notificação marcada como não lida.");
  });
}

export async function markAllReadAction(): Promise<ActionResult> {
  return run(async () => {
    await requireSession();

    const { error } = await db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);

    if (error) return fail(error.message);

    revalidatePath("/notificacoes");
    return ok(null, "Todas as notificações foram marcadas como lidas.");
  });
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireSession();

    const { error } = await db().from("notifications").delete().eq("id", id);
    if (error) return fail(error.message);

    revalidatePath("/notificacoes");
    return ok(null, "Notificação removida.");
  });
}
