import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { dispatchPendingEvents, retryFailedDeliveries } from "@/lib/webhooks";
import { reprocessFailedGatewayWebhooks } from "@/lib/payment-sync";
import { notify } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}` || request.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Rotina diária:
 *  1. marca vencidas / expiradas e reavalia o bloqueio de todos os projetos
 *  2. gera as faturas das assinaturas na janela de emissão
 *  3. entrega eventos pendentes e reprocessa webhooks que falharam
 *
 * Agende em produção com Vercel Cron (ver vercel.json).
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const report: Record<string, unknown> = {};

  try {
    const { data: maintenance, error: maintenanceError } = await db().rpc(
      "run_daily_billing_maintenance"
    );
    if (maintenanceError) throw new Error(maintenanceError.message);
    report.maintenance = Array.isArray(maintenance) ? maintenance[0] : maintenance;

    const { data: generated, error: generateError } = await db().rpc(
      "generate_subscription_invoices"
    );
    if (generateError) throw new Error(generateError.message);
    report.subscriptions = Array.isArray(generated) ? generated[0] : generated;

    report.gateway = await reprocessFailedGatewayWebhooks(50);
    report.events = await dispatchPendingEvents(200);
    report.retries = await retryFailedDeliveries(100);

    const created = (report.subscriptions as { created_count?: number })?.created_count ?? 0;
    if (created > 0) {
      await notify({
        title: `${created} cobrança(s) gerada(s) automaticamente`,
        body: "As assinaturas na janela de emissão geraram novas faturas.",
        severity: "INFO",
        category: "billing",
        actionUrl: "/cobrancas",
      });
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      ...report,
    });
  } catch (error) {
    console.error("[flowdesk-cron] falha:", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message, partial: report },
      { status: 500 }
    );
  }
}

export const POST = GET;
