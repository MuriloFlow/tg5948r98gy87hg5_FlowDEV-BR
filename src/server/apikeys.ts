"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { generateApiKey } from "@/lib/api-keys";
import { API_SCOPES } from "@/lib/types";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { ApiEnvironment, ApiKey } from "@/lib/types";

/**
 * O secret em claro só existe aqui — devolvemos uma única vez para a tela
 * exibir, e o banco guarda apenas o hash SHA-256.
 */
export interface IssuedApiKey {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  key_id: string;
  secret: string;
  environment: ApiEnvironment;
  scopes: string[];
  rate_limit_per_minute: number;
}

const SCOPE_SET = new Set<string>(API_SCOPES);

const createSchema = z.object({
  project_id: z.string().uuid("Selecione o projeto"),
  name: z.string().trim().min(2, "Dê um nome para identificar a chave"),
  environment: z.enum(["TEST", "LIVE"]),
  scopes: z.array(z.string()).min(1, "Selecione ao menos um escopo"),
  rate_limit_per_minute: z.number().int().min(1, "Mínimo 1").max(10_000, "Máximo 10.000"),
  allowed_ips: z.array(z.string()),
  allowed_origins: z.array(z.string()),
  expires_at: z.string().trim().nullable(),
});

const updateSchema = createSchema.omit({ project_id: true, environment: true, expires_at: true });

function readScopes(formData: FormData): string[] {
  return readForm(formData)
    .list("scopes")
    .filter((scope) => SCOPE_SET.has(scope));
}

function revalidateKeys(projectId?: string) {
  revalidatePath("/credenciais");
  revalidatePath("/projetos");
  if (projectId) revalidatePath(`/projetos/${projectId}`);
}

async function projectName(projectId: string): Promise<string> {
  const { data } = await db().from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined) ?? "Projeto";
}

export async function createApiKeyAction(
  _prev: ActionResult<IssuedApiKey> | null,
  formData: FormData
): Promise<ActionResult<IssuedApiKey>> {
  return run(async () => {
    const user = await assertPermission("apikeys:manage");
    const f = readForm(formData);

    const parsed = createSchema.safeParse({
      project_id: f.str("project_id"),
      name: f.str("name"),
      environment: f.str("environment") || "LIVE",
      scopes: readScopes(formData),
      rate_limit_per_minute: Number(f.str("rate_limit_per_minute") || 120),
      allowed_ips: f.csv("allowed_ips"),
      allowed_origins: f.csv("allowed_origins"),
      expires_at: f.optional("expires_at"),
    });

    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const generated = generateApiKey(parsed.data.environment);

    const key = await must<ApiKey>(
      db()
        .from("api_keys")
        .insert({
          project_id: parsed.data.project_id,
          name: parsed.data.name,
          environment: parsed.data.environment,
          key_id: generated.keyId,
          secret_hash: generated.secretHash,
          secret_prefix: generated.secretPrefix,
          secret_last4: generated.secretLast4,
          scopes: parsed.data.scopes,
          allowed_ips: parsed.data.allowed_ips,
          allowed_origins: parsed.data.allowed_origins,
          rate_limit_per_minute: parsed.data.rate_limit_per_minute,
          expires_at: parsed.data.expires_at
            ? new Date(`${parsed.data.expires_at}T23:59:59`).toISOString()
            : null,
          status: "ACTIVE",
          created_by: user.id,
        })
        .select("*")
        .single()
    );

    await audit({
      action: "api_key.created",
      entityType: "api_key",
      entityId: key.id,
      entityLabel: key.key_id,
      after: { name: key.name, environment: key.environment, scopes: key.scopes },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateKeys(key.project_id);

    return ok<IssuedApiKey>(
      {
        id: key.id,
        project_id: key.project_id,
        project_name: await projectName(key.project_id),
        name: key.name,
        key_id: key.key_id,
        secret: generated.secret,
        environment: key.environment,
        scopes: key.scopes,
        rate_limit_per_minute: key.rate_limit_per_minute,
      },
      "Chave criada. Copie o secret agora."
    );
  });
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("apikeys:manage");

    const key = await must<ApiKey>(
      db()
        .from("api_keys")
        .update({
          status: "REVOKED",
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: id,
      entityLabel: key.key_id,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateKeys(key.project_id);
    return ok(null, "Chave revogada. As requisições com ela passam a receber 401.");
  });
}

export async function rotateApiKeyAction(id: string): Promise<ActionResult<IssuedApiKey>> {
  return run(async () => {
    const user = await assertPermission("apikeys:manage");

    const before = await must<ApiKey>(db().from("api_keys").select("*").eq("id", id).single());
    const generated = generateApiKey(before.environment);

    const key = await must<ApiKey>(
      db()
        .from("api_keys")
        .update({
          key_id: generated.keyId,
          secret_hash: generated.secretHash,
          secret_prefix: generated.secretPrefix,
          secret_last4: generated.secretLast4,
          status: "ACTIVE",
          revoked_at: null,
          revoked_by: null,
          usage_count: 0,
          last_used_at: null,
          last_used_ip: null,
        })
        .eq("id", id)
        .select("*")
        .single()
    );

    await audit({
      action: "api_key.rotated",
      entityType: "api_key",
      entityId: id,
      entityLabel: key.key_id,
      before: { key_id: before.key_id },
      after: { key_id: key.key_id },
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateKeys(key.project_id);

    return ok<IssuedApiKey>(
      {
        id: key.id,
        project_id: key.project_id,
        project_name: await projectName(key.project_id),
        name: key.name,
        key_id: key.key_id,
        secret: generated.secret,
        environment: key.environment,
        scopes: key.scopes,
        rate_limit_per_minute: key.rate_limit_per_minute,
      },
      "Chave rotacionada. O secret anterior deixou de funcionar."
    );
  });
}

export async function updateApiKeyAction(
  _prev: ActionResult<ApiKey> | null,
  formData: FormData
): Promise<ActionResult<ApiKey>> {
  return run(async () => {
    const user = await assertPermission("apikeys:manage");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Chave não identificada.");

    const f = readForm(formData);
    const parsed = updateSchema.safeParse({
      name: f.str("name"),
      scopes: readScopes(formData),
      rate_limit_per_minute: Number(f.str("rate_limit_per_minute") || 120),
      allowed_ips: f.csv("allowed_ips"),
      allowed_origins: f.csv("allowed_origins"),
    });

    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const before = await must<ApiKey>(db().from("api_keys").select("*").eq("id", id).single());

    const key = await must<ApiKey>(
      db().from("api_keys").update(parsed.data).eq("id", id).select("*").single()
    );

    await audit({
      action: "api_key.updated",
      entityType: "api_key",
      entityId: id,
      entityLabel: key.key_id,
      before,
      after: key,
      actorId: user.id,
      actorLabel: user.name,
    });

    revalidateKeys(key.project_id);
    return ok(key, "Chave atualizada.");
  });
}
