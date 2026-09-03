import "server-only";

/** URL canônica de produção — usada quando o ambiente local não deve ir para o cliente. */
export const PRODUCTION_APP_URL = "https://flowdeskbrasil.vercel.app";

function optional(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function normalizeAppUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return trimmed;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

/** Host local — links com essa origem não devem ser enviados a clientes. */
export function isLocalAppUrl(url: string): boolean {
  try {
    const host = new URL(normalizeAppUrl(url)).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal")
    );
  } catch {
    return false;
  }
}

/**
 * URL pública para links compartilhados com clientes:
 * checkout (/pay/...), cobranças, documentação da API, webhooks em produção.
 *
 * Nunca devolve localhost por padrão — mesmo rodando `npm run dev` localmente,
 * o link copiado aponta para a URL pública de produção.
 */
export function resolvePublicAppUrl(): string {
  const dedicated = optional("NEXT_PUBLIC_PUBLIC_URL") || optional("FLOWDESK_PUBLIC_URL");
  if (dedicated && !isLocalAppUrl(dedicated)) {
    return normalizeAppUrl(dedicated);
  }

  const configured = optional("NEXT_PUBLIC_APP_URL");
  if (configured && !isLocalAppUrl(configured)) {
    return normalizeAppUrl(configured);
  }

  const vercelProd = optional("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercelProd) {
    return normalizeAppUrl(vercelProd);
  }

  const vercel = optional("VERCEL_URL");
  if (vercel && !isLocalAppUrl(vercel)) {
    return normalizeAppUrl(vercel);
  }

  // Opt-in explícito para compartilhar localhost (ex.: ngrok apontando pro dev)
  if (optional("FLOWDESK_SHARE_LOCAL") === "true" && configured) {
    return normalizeAppUrl(configured);
  }

  return PRODUCTION_APP_URL;
}

/**
 * URL de runtime da aplicação — redirects internos, sessão, etc.
 * Em dev local retorna http://localhost:3000.
 */
export function resolveAppUrl(): string {
  const configured = optional("NEXT_PUBLIC_APP_URL");
  if (configured) return normalizeAppUrl(configured);

  const vercelProd = optional("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercelProd) return normalizeAppUrl(vercelProd);

  const vercel = optional("VERCEL_URL");
  if (vercel) return normalizeAppUrl(vercel);

  return "http://localhost:3000";
}

/** Monta a URL pública do checkout hospedado. */
export function publicPayUrl(token: string): string {
  return `${resolvePublicAppUrl()}/pay/${encodeURIComponent(token)}`;
}

/** Monta path relativo ou absoluto público para cobrança/pagamento. */
export function publicAppPath(path: string): string {
  const base = resolvePublicAppUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
