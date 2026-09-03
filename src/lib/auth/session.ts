import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db, maybe } from "@/lib/db";
import type { AdminUser } from "@/lib/types";

export const SESSION_COOKIE = "fd_session";
const SESSION_TTL_HOURS = 12;
const REMEMBER_TTL_HOURS = 24 * 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestContext() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function createSession(userId: string, remember = false): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { ip, userAgent } = await requestContext();
  const ttl = remember ? REMEMBER_TTL_HOURS : SESSION_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttl * 3_600_000);

  const { error } = await db().from("admin_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    ip,
    user_agent: userAgent,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db()
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token));
  }
  store.delete(SESSION_COOKIE);
}

export interface SessionUser extends AdminUser {
  session_id: string;
}

/** Lê a sessão do cookie. Retorna null se ausente, expirada ou revogada. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const row = await maybe<{
      id: string;
      expires_at: string;
      revoked_at: string | null;
      admin_users: AdminUser | null;
    }>(
      db()
        .from("admin_sessions")
        .select("id, expires_at, revoked_at, admin_users(*)")
        .eq("token_hash", hashToken(token))
        .maybeSingle()
    );

    if (!row || row.revoked_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;

    const user = row.admin_users;
    if (!user || user.status !== "ACTIVE") return null;

    // heartbeat sem bloquear a renderização
    void db()
      .from("admin_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(() => undefined);

    return { ...user, session_id: row.id };
  } catch {
    return null;
  }
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  let query = db()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (exceptSessionId) query = query.neq("id", exceptSessionId);
  await query;
}
