import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env, isMercadoPagoConfigured } from "@/lib/env";
import { testCredentials } from "@/lib/mercadopago";
import { GatewaysClient, type GatewayWebhookRow } from "./gateways-client";

export const metadata: Metadata = { title: "Gateways" };
export const dynamic = "force-dynamic";

async function loadWebhooks(): Promise<GatewayWebhookRow[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("gateway_webhooks")
      .select(
        "id, provider, event_type, external_id, signature_valid, processed, processed_at, process_error, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(25);
    return (data ?? []) as GatewayWebhookRow[];
  }, []);
}

async function loadCounts() {
  return safeQuery(
    async () => {
      const [total, pending, invalid] = await Promise.all([
        db().from("gateway_webhooks").select("id", { count: "exact", head: true }),
        db()
          .from("gateway_webhooks")
          .select("id", { count: "exact", head: true })
          .eq("processed", false),
        db()
          .from("gateway_webhooks")
          .select("id", { count: "exact", head: true })
          .eq("signature_valid", false),
      ]);

      return {
        total: total.count ?? 0,
        pending: pending.count ?? 0,
        invalid: invalid.count ?? 0,
      };
    },
    { total: 0, pending: 0, invalid: 0 }
  );
}

export default async function GatewaysPage() {
  await requirePermission("settings:manage");

  const configured = isMercadoPagoConfigured();
  const [connection, webhooks, counts] = await Promise.all([
    configured
      ? testCredentials()
      : Promise.resolve({
          ok: false,
          message:
            "Nenhum Access Token configurado. Defina MERCADOPAGO_ACCESS_TOKEN nas variáveis de ambiente.",
        }),
    loadWebhooks(),
    loadCounts(),
  ]);

  return (
    <>
      <PageHeader
        title="Gateways de pagamento"
        description="Conexão com o Mercado Pago, URL de webhook e histórico das notificações recebidas."
      />

      <GatewaysClient
        appUrl={env.appUrl}
        tokenConfigured={configured}
        webhookSecretConfigured={Boolean(env.mercadoPagoWebhookSecret)}
        publicKeyConfigured={Boolean(env.mercadoPagoPublicKey)}
        connection={connection}
        webhooks={webhooks}
        counts={counts}
      />
    </>
  );
}
