import { apiHandler, API_VERSION, optionsResponse } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ping — verificação rápida de credencial e conectividade. */
export const GET = apiHandler({ scope: "entitlement:read" }, async (context) => ({
  object: "ping",
  ok: true,
  api_version: API_VERSION,
  project_id: context.projectId,
  key_id: context.apiKey.key_id,
  environment: context.apiKey.environment,
  scopes: context.apiKey.scopes,
  server_time: new Date().toISOString(),
}));

export const OPTIONS = optionsResponse;
