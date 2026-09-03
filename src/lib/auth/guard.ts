import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";
import type { AdminRole } from "@/lib/types";

export type Permission =
  | "customers:read"
  | "customers:write"
  | "projects:read"
  | "projects:write"
  | "projects:block"
  | "billing:read"
  | "billing:write"
  | "payments:refund"
  | "apikeys:manage"
  | "webhooks:manage"
  | "team:manage"
  | "settings:manage"
  | "audit:read";

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  OWNER: [
    "customers:read", "customers:write", "projects:read", "projects:write", "projects:block",
    "billing:read", "billing:write", "payments:refund", "apikeys:manage", "webhooks:manage",
    "team:manage", "settings:manage", "audit:read",
  ],
  ADMIN: [
    "customers:read", "customers:write", "projects:read", "projects:write", "projects:block",
    "billing:read", "billing:write", "payments:refund", "apikeys:manage", "webhooks:manage",
    "audit:read",
  ],
  FINANCE: [
    "customers:read", "projects:read", "billing:read", "billing:write",
    "payments:refund", "audit:read",
  ],
  SUPPORT: ["customers:read", "projects:read", "billing:read"],
  READONLY: ["customers:read", "projects:read", "billing:read"],
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: AdminRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Usado em páginas do painel: redireciona para o login quando não autenticado. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    redirect("/dashboard?error=sem-permissao");
  }
  return user;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Sem permissão para: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Usado em server actions e rotas internas: lança em vez de redirecionar. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}
