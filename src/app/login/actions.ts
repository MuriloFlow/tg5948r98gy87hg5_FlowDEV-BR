"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, checkPasswordStrength } from "@/lib/auth/password";
import { createSession, requestContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

const MAX_ATTEMPTS = 6;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe sua senha"),
  remember: z.boolean().optional(),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const { email, password, remember } = parsed.data;

  try {
    const { data: user } = await db()
      .from("admin_users")
      .select("id, name, email, password_hash, status, failed_attempts, locked_until, role")
      .eq("email", email)
      .maybeSingle();

    // Mensagem genérica: nunca revelamos se o e-mail existe.
    const genericError = "E-mail ou senha incorretos.";

    if (!user) {
      await new Promise((r) => setTimeout(r, 350));
      return { error: genericError };
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutes = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60_000
      );
      return {
        error: `Conta temporariamente bloqueada por tentativas inválidas. Tente novamente em ${minutes} min.`,
      };
    }

    if (user.status !== "ACTIVE") {
      return { error: "Este acesso está desativado. Fale com o proprietário da conta." };
    }

    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      const attempts = (user.failed_attempts ?? 0) + 1;
      await db()
        .from("admin_users")
        .update({
          failed_attempts: attempts,
          locked_until:
            attempts >= MAX_ATTEMPTS
              ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
              : null,
        })
        .eq("id", user.id);

      await audit({
        action: "auth.login_failed",
        entityType: "admin_user",
        entityId: user.id,
        entityLabel: user.email,
        actorType: "PUBLIC",
        after: { attempts },
      });

      const left = MAX_ATTEMPTS - attempts;
      return {
        error:
          left > 0 && left <= 3
            ? `${genericError} ${left} tentativa${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}.`
            : genericError,
      };
    }

    const { ip } = await requestContext();
    await db()
      .from("admin_users")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
      })
      .eq("id", user.id);

    await createSession(user.id, remember);

    await audit({
      action: "auth.login",
      entityType: "admin_user",
      entityId: user.id,
      entityLabel: user.email,
      actorId: user.id,
      actorLabel: user.name,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("não configurado")) {
      return {
        error:
          "Banco de dados não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local e reinicie o servidor.",
      };
    }
    if (message.includes("admin_users") || message.includes("does not exist")) {
      return {
        error:
          "As tabelas ainda não existem. Rode os arquivos de sql/ no SQL Editor do Supabase.",
      };
    }
    return { error: `Falha ao autenticar: ${message}` };
  }

  redirect("/dashboard");
}

const setupSchema = z
  .object({
    name: z.string().trim().min(3, "Informe seu nome completo"),
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
    password: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não conferem",
    path: ["confirm"],
  });

/** Cria o primeiro usuário OWNER. Só funciona enquanto não houver nenhum. */
export async function setupAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) {
    return { fieldErrors: { password: strength.issues[0] } };
  }

  try {
    const { count } = await db()
      .from("admin_users")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) > 0) {
      return { error: "Já existe um administrador cadastrado. Faça login normalmente." };
    }

    const { data: created, error } = await db()
      .from("admin_users")
      .insert({
        name: parsed.data.name,
        email: parsed.data.email,
        password_hash: await hashPassword(parsed.data.password),
        role: "OWNER",
        status: "ACTIVE",
      })
      .select("id, name, email")
      .single();

    if (error) return { error: `Não foi possível criar o acesso: ${error.message}` };

    await createSession(created.id, true);
    await audit({
      action: "auth.owner_created",
      entityType: "admin_user",
      entityId: created.id,
      entityLabel: created.email,
      actorId: created.id,
      actorLabel: created.name,
    });
  } catch (error) {
    return { error: `Falha na configuração inicial: ${(error as Error).message}` };
  }

  redirect("/dashboard");
}
