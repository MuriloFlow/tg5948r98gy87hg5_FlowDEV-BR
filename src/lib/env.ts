import "server-only";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/**
 * Variáveis lidas sob demanda: o build do Next roda sem banco configurado,
 * então a validação acontece no momento do uso e não na importação.
 */
export const env = {
  get supabaseUrl() {
    return optional("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return optional("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return optional("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appUrl() {
    const explicit = optional("NEXT_PUBLIC_APP_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = optional("VERCEL_PROJECT_PRODUCTION_URL") || optional("VERCEL_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },
  get sessionSecret() {
    return (
      optional("FLOWDESK_SESSION_SECRET") ||
      optional("SUPABASE_SERVICE_ROLE_KEY") ||
      "flowdesk-dev-secret-change-me"
    );
  },
  get mercadoPagoAccessToken() {
    return optional("MERCADOPAGO_ACCESS_TOKEN");
  },
  get mercadoPagoPublicKey() {
    return optional("NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY");
  },
  get mercadoPagoWebhookSecret() {
    return optional("MERCADOPAGO_WEBHOOK_SECRET");
  },
  /** Sobrescreve o destino do webhook — útil para túneis (ngrok) em desenvolvimento. */
  get mercadoPagoNotificationUrl() {
    return optional("MERCADOPAGO_NOTIFICATION_URL").replace(/\/$/, "");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

export function isDatabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}

export function isMercadoPagoConfigured(): boolean {
  return Boolean(env.mercadoPagoAccessToken);
}
