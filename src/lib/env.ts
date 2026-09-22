import "server-only";

import { resolveAppUrl, resolvePublicAppUrl } from "./public-url";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/**
 * Variáveis lidas sob demanda: o build do Next roda sem banco configurado,
 * então a validação acontece no momento do uso e não na importação.
 */
const VPS_URL = "https://flowdev.db.flwdesk.com";
const VPS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMDI5NjAwLCJleHAiOjE5NDc3MDk2MDB9.yPgutsfUlQPS6mjSegQU8MRTaPNK9cKqJiSopVh0GDA";
const VPS_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3OTAwMjk2MDAsImV4cCI6MTk0NzcwOTYwMH0.DiNtBP8vUMyrYwv2A_j0TYN8AwbpY3tlIEnVABNrRAw";

function isLegacySupabaseHost(url?: string) {
  if (!url) return true;
  return url.includes("supabase.co") || url.includes("2.25.237.179");
}

export const env = {
  get supabaseUrl() {
    const raw = optional("NEXT_PUBLIC_SUPABASE_URL");
    return isLegacySupabaseHost(raw) ? VPS_URL : raw;
  },
  get supabaseAnonKey() {
    const raw = optional("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return !raw || isLegacySupabaseHost(optional("NEXT_PUBLIC_SUPABASE_URL")) ? VPS_ANON_KEY : raw;
  },
  get supabaseServiceKey() {
    const raw = optional("SUPABASE_SERVICE_ROLE_KEY");
    return !raw || isLegacySupabaseHost(optional("NEXT_PUBLIC_SUPABASE_URL")) ? VPS_SERVICE_ROLE_KEY : raw;
  },
  /** URL de runtime (painel aberto no browser, redirects internos). */
  get appUrl() {
    return resolveAppUrl();
  },
  /** URL pública para links enviados a clientes — nunca localhost por padrão. */
  get publicAppUrl() {
    return resolvePublicAppUrl();
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

  /* ------------------------------------------------------------------ SMTP */
  get smtpHost() {
    return optional("AUTH_SMTP_HOST");
  },
  get smtpPort() {
    return numeric("AUTH_SMTP_PORT", 587);
  },
  /** true = TLS direto (465). false = texto puro com STARTTLS (587). */
  get smtpSecure() {
    return boolean("AUTH_SMTP_SECURE", env.smtpPort === 465);
  },
  get smtpUser() {
    return optional("AUTH_SMTP_USER");
  },
  get smtpPass() {
    // A senha pode legitimamente começar com "=", então nada de trim agressivo.
    return process.env.AUTH_SMTP_PASS ?? "";
  },
  get smtpFromEmail() {
    return optional("AUTH_SMTP_FROM_EMAIL") || env.smtpUser;
  },
  get smtpFromName() {
    return optional("AUTH_SMTP_FROM_NAME", "FlowDesk");
  },
  /** Return-Path — o que o servidor valida no SPF. */
  get smtpEnvelopeFrom() {
    return optional("AUTH_SMTP_ENVELOPE_FROM") || env.smtpFromEmail;
  },
  get smtpReplyTo() {
    return optional("AUTH_SMTP_REPLY_TO");
  },
  get smtpDkimDomain() {
    return optional("AUTH_SMTP_DKIM_DOMAIN");
  },
  get smtpDkimSelector() {
    return optional("AUTH_SMTP_DKIM_SELECTOR");
  },
  get smtpDkimPrivateKey() {
    return optional("AUTH_SMTP_DKIM_PRIVATE_KEY");
  },
  get smtpDebug() {
    return boolean("AUTH_SMTP_DEBUG", false);
  },

  /* -------------------------------------------------------------- WhatsApp */
  get whatsappToken() {
    return optional("WHATSAPP_ACCESS_TOKEN");
  },
  get whatsappPhoneNumberId() {
    return optional("WHATSAPP_PHONE_NUMBER_ID");
  },
  get whatsappBusinessAccountId() {
    return optional("WHATSAPP_BUSINESS_ACCOUNT_ID");
  },
  /** Token que a Meta devolve na verificação do webhook. */
  get whatsappVerifyToken() {
    return optional("WHATSAPP_VERIFY_TOKEN");
  },
  /** App secret — valida a assinatura `x-hub-signature-256` dos webhooks. */
  get whatsappAppSecret() {
    return optional("WHATSAPP_APP_SECRET");
  },
  get whatsappApiVersion() {
    return optional("WHATSAPP_API_VERSION", "v21.0");
  },
  /** Número exibido ao cliente e usado no fallback wa.me. */
  get whatsappDisplayNumber() {
    return optional("WHATSAPP_DISPLAY_NUMBER");
  },
  /** Template aprovado usado fora da janela de 24h. */
  get whatsappDefaultTemplate() {
    return optional("WHATSAPP_DEFAULT_TEMPLATE");
  },

  /* ------------------------------------------------------------ Mensageria */
  get messagingBatchSize() {
    return numeric("MESSAGING_BATCH_SIZE", 15);
  },
  get messagingMaxAttempts() {
    return numeric("MESSAGING_MAX_ATTEMPTS", 5);
  },
} as const;

function numeric(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}

export function isMercadoPagoConfigured(): boolean {
  return Boolean(env.mercadoPagoAccessToken);
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpFromEmail);
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.whatsappToken && env.whatsappPhoneNumberId);
}

export { resolveAppUrl, resolvePublicAppUrl, publicPayUrl } from "./public-url";
