import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isDatabaseConfigured } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Cliente com service role. Toda a aplicação passa por aqui — as tabelas têm
 * RLS negando anon/authenticated, então nenhum acesso direto do browser é possível.
 */
export function db(): SupabaseClient {
  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
      global: { headers: { "X-Client-Info": "flowdesk/1.0" } },
    });
  }
  return cached;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Banco de dados não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local"
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Executa a query e lança em caso de erro, devolvendo os dados tipados. */
export async function must<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

/** Igual ao `must`, mas devolve null em vez de lançar quando não há linha. */
export async function maybe<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>
): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    // PGRST116 = nenhuma linha encontrada com .single()
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data;
}

/**
 * Consulta segura para telas: se o banco não estiver configurado ou a query
 * falhar, devolve o fallback em vez de derrubar a página inteira.
 */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[flowdesk] query falhou:", (error as Error).message);
    }
    return fallback;
  }
}
