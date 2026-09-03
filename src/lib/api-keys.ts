import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import type { ApiEnvironment } from "./types";

export interface GeneratedKey {
  keyId: string;
  secret: string;
  secretHash: string;
  secretPrefix: string;
  secretLast4: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Chaves no padrão Stripe:
 *   público  fd_live_pk_a1b2c3...
 *   secreto  fd_live_sk_<43 chars base64url>
 * O secreto só existe em memória no momento da criação — o banco guarda o hash.
 */
export function generateApiKey(environment: ApiEnvironment): GeneratedKey {
  const env = environment === "LIVE" ? "live" : "test";
  const keyId = `fd_${env}_pk_${randomBytes(12).toString("hex")}`;
  const secret = `fd_${env}_sk_${randomBytes(32).toString("base64url")}`;

  return {
    keyId,
    secret,
    secretHash: sha256(secret),
    secretPrefix: secret.slice(0, 15),
    secretLast4: secret.slice(-4),
  };
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function generatePublicToken(bytes = 12): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateShortCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(6);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

export interface AuthenticatedKey {
  id: string;
  project_id: string;
  environment: ApiEnvironment;
  scopes: string[];
  rate_limit_per_minute: number;
  allowed_ips: string[];
  allowed_origins: string[];
  status: string;
  expires_at: string | null;
  key_id: string;
  name: string;
}

/** Resolve o secret recebido no header para a chave correspondente. */
export async function resolveApiKey(secret: string): Promise<AuthenticatedKey | null> {
  if (!secret || !secret.startsWith("fd_")) return null;

  const { data, error } = await db()
    .from("api_keys")
    .select(
      "id, project_id, environment, scopes, rate_limit_per_minute, allowed_ips, allowed_origins, status, expires_at, key_id, name"
    )
    .eq("secret_hash", sha256(secret))
    .maybeSingle();

  if (error || !data) return null;
  return data as AuthenticatedKey;
}

/** Marca uso da chave sem bloquear a resposta da API. */
export function touchApiKey(apiKeyId: string, ip: string | null): void {
  void db()
    .rpc("touch_api_key", { p_api_key_id: apiKeyId, p_ip: ip })
    .then(() => undefined, () => undefined);
}
