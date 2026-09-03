import "server-only";
import { db } from "./db";
import { requestContext } from "./auth/session";
import type { ActorType } from "./types";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: unknown;
  after?: unknown;
  actorType?: ActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  requestId?: string | null;
}

function shallowDiff(before: unknown, after: unknown): Record<string, unknown> | null {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const diff: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      diff[key] = { de: a[key] ?? null, para: b[key] ?? null };
    }
  }
  return Object.keys(diff).length ? diff : null;
}

/** Nunca lança: uma falha de auditoria não pode derrubar a operação principal. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    await db()
      .from("audit_logs")
      .insert({
        actor_type: input.actorType ?? "ADMIN",
        actor_id: input.actorId ?? null,
        actor_label: input.actorLabel ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        entity_label: input.entityLabel ?? null,
        before_data: (input.before as object) ?? null,
        after_data: (input.after as object) ?? null,
        diff: shallowDiff(input.before, input.after),
        ip,
        user_agent: userAgent,
        request_id: input.requestId ?? null,
      });
  } catch (error) {
    console.error("[flowdesk] falha ao gravar auditoria:", (error as Error).message);
  }
}

export async function notify(input: {
  title: string;
  body?: string;
  severity?: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  category?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}): Promise<void> {
  try {
    await db().from("notifications").insert({
      title: input.title,
      body: input.body ?? null,
      severity: input.severity ?? "INFO",
      category: input.category ?? "general",
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      action_url: input.actionUrl ?? null,
    });
  } catch (error) {
    console.error("[flowdesk] falha ao criar notificação:", (error as Error).message);
  }
}
