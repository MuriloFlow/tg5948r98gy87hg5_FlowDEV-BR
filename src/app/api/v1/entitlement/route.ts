import { Errors } from "@/lib/api/errors";
import { buildEntitlementResponse } from "@/lib/entitlement";
import { apiHandler, optionsResponse } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/entitlement
 *
 * Consultado pelas aplicações integradas. Resposta rápida (<500ms) — não bloqueia
 * em chamadas ao Mercado Pago. Link de pagamento é resolvido do banco ou criado
 * sem provisionar checkout na hora.
 */
export const GET = apiHandler({ scope: "entitlement:read" }, async (context) => {
  const payload = await buildEntitlementResponse(context.projectId);
  if (!payload) throw Errors.notFound("Projeto");
  return payload;
});

export const OPTIONS = optionsResponse;
