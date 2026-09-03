import "server-only";
import type { z } from "zod";
import { ForbiddenError } from "@/lib/auth/guard";
import { DatabaseNotConfiguredError } from "@/lib/db";
import { MercadoPagoNotConfiguredError } from "@/lib/mercadopago";

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
  message?: string;
}

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function zodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Converte exceções técnicas em mensagens que fazem sentido para o usuário. */
export function toFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof DatabaseNotConfiguredError) return error.message;
  if (error instanceof MercadoPagoNotConfiguredError) return error.message;
  if (error instanceof ForbiddenError) return "Você não tem permissão para esta ação.";

  if (message.includes("duplicate key")) {
    if (message.includes("document")) return "Já existe um cliente com este CPF/CNPJ.";
    if (message.includes("email")) return "Este e-mail já está cadastrado.";
    if (message.includes("slug")) return "Já existe um projeto com este identificador.";
    if (message.includes("code")) return "Já existe um registro com este código.";
    return "Este registro já existe.";
  }
  if (message.includes("violates foreign key")) {
    return "Não é possível concluir: existem registros vinculados.";
  }
  if (message.includes("Sessão expirada")) return message;
  if (message.toLowerCase().includes("fetch failed")) {
    return "Não foi possível conectar ao banco de dados. Verifique sua conexão e as credenciais.";
  }

  return message;
}

/** Executa a ação capturando qualquer erro e devolvendo um ActionResult. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    console.error("[flowdesk] action falhou:", error);
    return fail(toFriendlyError(error));
  }
}

/** Lê valores de FormData de forma segura. */
export function readForm(formData: FormData) {
  return {
    str(key: string): string {
      return String(formData.get(key) ?? "").trim();
    },
    optional(key: string): string | null {
      const value = String(formData.get(key) ?? "").trim();
      return value.length ? value : null;
    },
    num(key: string, fallback = 0): number {
      const raw = String(formData.get(key) ?? "").replace(/\./g, "").replace(",", ".");
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    },
    bool(key: string): boolean {
      const value = formData.get(key);
      return value === "on" || value === "true" || value === "1";
    },
    list(key: string): string[] {
      return formData
        .getAll(key)
        .map((v) => String(v).trim())
        .filter(Boolean);
    },
    csv(key: string): string[] {
      return String(formData.get(key) ?? "")
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean);
    },
  };
}
