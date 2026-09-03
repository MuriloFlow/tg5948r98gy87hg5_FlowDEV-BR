"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, must } from "@/lib/db";
import { assertPermission } from "@/lib/auth/guard";
import { getSessionUser, revokeAllSessions } from "@/lib/auth/session";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { fail, ok, readForm, run, zodErrors, type ActionResult } from "./action-utils";
import type { AdminRole, AdminUser } from "@/lib/types";

const ROLES = ["OWNER", "ADMIN", "FINANCE", "SUPPORT", "READONLY"] as const;

/** Alfabeto sem caracteres ambíguos (0/O, 1/l) — a senha é ditada por telefone. */
const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generateTempPassword(): string {
  const bytes = randomBytes(14);
  let core = "";
  for (const byte of bytes) core += SAFE_ALPHABET[byte % SAFE_ALPHABET.length];
  // prefixo/sufixo garantem maiúscula, minúscula, dígito e símbolo
  return `Fd${core}9!`;
}

async function requireSelf() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
  return user;
}

/** Quantos OWNERs ativos existem, ignorando opcionalmente um usuário. */
async function countActiveOwners(exceptId?: string): Promise<number> {
  let query = db()
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "OWNER")
    .eq("status", "ACTIVE");

  if (exceptId) query = query.neq("id", exceptId);

  const { count } = await query;
  return count ?? 0;
}

function revalidateTeam() {
  revalidatePath("/equipe");
  revalidatePath("/configuracoes");
}

/* -------------------------------------------------------------------------- */
/* Convite de novos usuários                                                   */
/* -------------------------------------------------------------------------- */

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(ROLES),
  phone: z.string().trim().nullable(),
});

export async function inviteUserAction(
  _prev: ActionResult<{ user: AdminUser; temp_password: string }> | null,
  formData: FormData
): Promise<ActionResult<{ user: AdminUser; temp_password: string }>> {
  return run(async () => {
    const actor = await assertPermission("team:manage");
    const f = readForm(formData);

    const parsed = inviteSchema.safeParse({
      name: f.str("name"),
      email: f.str("email"),
      role: f.str("role") || "SUPPORT",
      phone: f.optional("phone"),
    });
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const tempPassword = generateTempPassword();

    const user = await must<AdminUser>(
      db()
        .from("admin_users")
        .insert({
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          role: parsed.data.role,
          status: "ACTIVE",
          password_hash: await hashPassword(tempPassword),
          must_change_password: true,
        })
        .select("*")
        .single()
    );

    await audit({
      action: "team.user_invited",
      entityType: "admin_user",
      entityId: user.id,
      entityLabel: user.email,
      after: { name: user.name, email: user.email, role: user.role },
      actorId: actor.id,
      actorLabel: actor.name,
    });

    revalidateTeam();
    return ok(
      { user, temp_password: tempPassword },
      `${user.name} foi adicionado à equipe. Copie a senha temporária agora — ela não será exibida novamente.`
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Papel, status e sessões                                                     */
/* -------------------------------------------------------------------------- */

export async function updateUserRoleAction(
  id: string,
  role: AdminRole
): Promise<ActionResult> {
  return run(async () => {
    const actor = await assertPermission("team:manage");
    if (!ROLES.includes(role)) return fail("Papel inválido.");

    const before = await must<AdminUser>(
      db().from("admin_users").select("*").eq("id", id).single()
    );

    if (before.role === role) return ok(null, "Nenhuma alteração a fazer.");

    if (before.role === "OWNER" && role !== "OWNER") {
      const remaining = await countActiveOwners(id);
      if (remaining === 0) {
        return fail(
          "Este é o último proprietário ativo. Promova outro usuário a proprietário antes de alterar este papel."
        );
      }
    }

    await must(db().from("admin_users").update({ role }).eq("id", id).select("id").single());

    await audit({
      action: "team.role_changed",
      entityType: "admin_user",
      entityId: id,
      entityLabel: before.email,
      before: { role: before.role },
      after: { role },
      actorId: actor.id,
      actorLabel: actor.name,
    });

    revalidateTeam();
    return ok(null, `Papel de ${before.name} atualizado.`);
  });
}

export async function deactivateUserAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const actor = await assertPermission("team:manage");

    if (actor.id === id) {
      return fail("Você não pode desativar a própria conta.");
    }

    const before = await must<AdminUser>(
      db().from("admin_users").select("*").eq("id", id).single()
    );

    if (before.role === "OWNER") {
      const remaining = await countActiveOwners(id);
      if (remaining === 0) {
        return fail(
          "Este é o último proprietário ativo. Promova outro usuário a proprietário antes de desativar este."
        );
      }
    }

    await must(
      db().from("admin_users").update({ status: "INACTIVE" }).eq("id", id).select("id").single()
    );
    await revokeAllSessions(id);

    await audit({
      action: "team.user_deactivated",
      entityType: "admin_user",
      entityId: id,
      entityLabel: before.email,
      before: { status: before.status },
      after: { status: "INACTIVE" },
      actorId: actor.id,
      actorLabel: actor.name,
    });

    revalidateTeam();
    return ok(null, `${before.name} foi desativado e todas as sessões foram encerradas.`);
  });
}

export async function reactivateUserAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const actor = await assertPermission("team:manage");

    const user = await must<AdminUser>(
      db().from("admin_users").update({ status: "ACTIVE" }).eq("id", id).select("*").single()
    );

    await audit({
      action: "team.user_reactivated",
      entityType: "admin_user",
      entityId: id,
      entityLabel: user.email,
      after: { status: "ACTIVE" },
      actorId: actor.id,
      actorLabel: actor.name,
    });

    revalidateTeam();
    return ok(null, `${user.name} foi reativado.`);
  });
}

export async function resetUserPasswordAction(
  id: string
): Promise<ActionResult<{ temp_password: string }>> {
  return run(async () => {
    const actor = await assertPermission("team:manage");

    const user = await must<AdminUser>(
      db().from("admin_users").select("*").eq("id", id).single()
    );

    const tempPassword = generateTempPassword();

    await must(
      db()
        .from("admin_users")
        .update({
          password_hash: await hashPassword(tempPassword),
          must_change_password: true,
          failed_attempts: 0,
          locked_until: null,
        })
        .eq("id", id)
        .select("id")
        .single()
    );

    await revokeAllSessions(id);

    await audit({
      action: "team.password_reset",
      entityType: "admin_user",
      entityId: id,
      entityLabel: user.email,
      actorId: actor.id,
      actorLabel: actor.name,
    });

    revalidateTeam();
    return ok(
      { temp_password: tempPassword },
      `Senha de ${user.name} redefinida. Copie a senha temporária agora.`
    );
  });
}

export async function revokeSessionsAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const actor = await assertPermission("team:manage");

    const user = await must<AdminUser>(
      db().from("admin_users").select("*").eq("id", id).single()
    );

    await revokeAllSessions(id, actor.id === id ? actor.session_id : undefined);

    await audit({
      action: "team.sessions_revoked",
      entityType: "admin_user",
      entityId: id,
      entityLabel: user.email,
      actorId: actor.id,
      actorLabel: actor.name,
    });

    revalidateTeam();
    return ok(null, `Sessões de ${user.name} encerradas.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Conta do próprio usuário                                                    */
/* -------------------------------------------------------------------------- */

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome"),
  phone: z.string().trim().nullable(),
  avatar_url: z.string().trim().nullable(),
  timezone: z.string().trim().min(1, "Selecione o fuso horário"),
});

export async function updateOwnProfileAction(
  _prev: ActionResult<AdminUser> | null,
  formData: FormData
): Promise<ActionResult<AdminUser>> {
  return run(async () => {
    const self = await requireSelf();
    const f = readForm(formData);

    const parsed = profileSchema.safeParse({
      name: f.str("name"),
      phone: f.optional("phone"),
      avatar_url: f.optional("avatar_url"),
      timezone: f.str("timezone") || "America/Sao_Paulo",
    });
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const user = await must<AdminUser>(
      db().from("admin_users").update(parsed.data).eq("id", self.id).select("*").single()
    );

    await audit({
      action: "account.profile_updated",
      entityType: "admin_user",
      entityId: self.id,
      entityLabel: self.email,
      before: { name: self.name, phone: self.phone, timezone: self.timezone },
      after: { name: user.name, phone: user.phone, timezone: user.timezone },
      actorId: self.id,
      actorLabel: self.name,
    });

    revalidatePath("/configuracoes");
    return ok(user, "Perfil atualizado.");
  });
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual"),
    next: z.string().min(10, "A nova senha precisa ter ao menos 10 caracteres"),
    confirm: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.next === data.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

export async function changeOwnPasswordAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return run(async () => {
    const self = await requireSelf();
    const f = readForm(formData);

    const parsed = passwordSchema.safeParse({
      current: f.str("current_password"),
      next: f.str("new_password"),
      confirm: f.str("confirm_password"),
    });
    if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));

    const strength = checkPasswordStrength(parsed.data.next);
    if (!strength.ok) {
      return fail("A nova senha é fraca.", { new_password: strength.issues.join(". ") });
    }

    const row = await must<{ password_hash: string }>(
      db().from("admin_users").select("password_hash").eq("id", self.id).single()
    );

    const valid = await verifyPassword(parsed.data.current, row.password_hash);
    if (!valid) {
      return fail("Senha atual incorreta.", { current_password: "Senha atual incorreta" });
    }

    if (await verifyPassword(parsed.data.next, row.password_hash)) {
      return fail("A nova senha precisa ser diferente da atual.", {
        new_password: "Escolha uma senha diferente da atual",
      });
    }

    await must(
      db()
        .from("admin_users")
        .update({
          password_hash: await hashPassword(parsed.data.next),
          must_change_password: false,
        })
        .eq("id", self.id)
        .select("id")
        .single()
    );

    // mantém apenas a sessão atual ativa
    await revokeAllSessions(self.id, self.session_id);

    await audit({
      action: "account.password_changed",
      entityType: "admin_user",
      entityId: self.id,
      entityLabel: self.email,
      actorId: self.id,
      actorLabel: self.name,
    });

    revalidatePath("/configuracoes");
    return ok(null, "Senha alterada. As outras sessões foram encerradas.");
  });
}

/** Encerra todas as sessões do próprio usuário, exceto a que está em uso. */
export async function revokeOtherOwnSessionsAction(): Promise<ActionResult> {
  return run(async () => {
    const self = await requireSelf();
    await revokeAllSessions(self.id, self.session_id);

    await audit({
      action: "account.sessions_revoked",
      entityType: "admin_user",
      entityId: self.id,
      entityLabel: self.email,
      actorId: self.id,
      actorLabel: self.name,
    });

    revalidatePath("/configuracoes");
    return ok(null, "As outras sessões foram encerradas.");
  });
}

/** Preferências de interface gravadas em `admin_users.preferences`. */
export async function updateOwnPreferencesAction(
  preferences: Record<string, string>
): Promise<ActionResult> {
  return run(async () => {
    const self = await requireSelf();

    const merged = { ...(self.preferences ?? {}), ...preferences };

    await must(
      db()
        .from("admin_users")
        .update({ preferences: merged })
        .eq("id", self.id)
        .select("id")
        .single()
    );

    await audit({
      action: "account.preferences_updated",
      entityType: "admin_user",
      entityId: self.id,
      entityLabel: self.email,
      before: self.preferences,
      after: merged,
      actorId: self.id,
      actorLabel: self.name,
    });

    revalidatePath("/configuracoes");
    return ok(null, "Preferências salvas.");
  });
}
