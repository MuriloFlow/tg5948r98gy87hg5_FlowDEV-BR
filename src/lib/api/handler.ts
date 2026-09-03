import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveApiKey, touchApiKey, type AuthenticatedKey } from "@/lib/api-keys";
import { ApiError, Errors } from "./errors";

export const API_VERSION = "2026-01-01";

export interface ApiContext {
  requestId: string;
  apiKey: AuthenticatedKey;
  projectId: string;
  ip: string | null;
  userAgent: string | null;
  body: Record<string, unknown>;
  query: URLSearchParams;
  idempotencyKey: string | null;
}

export interface HandlerOptions {
  /** Escopo obrigatório para acessar o endpoint. */
  scope: string;
  /** Métodos mutáveis honram Idempotency-Key. */
  idempotent?: boolean;
  /** Bloqueia a chamada se o projeto estiver bloqueado por inadimplência. */
  requireActiveProject?: boolean;
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

function extractSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  return null;
}

async function logRequest(input: {
  requestId: string;
  apiKeyId: string | null;
  projectId: string | null;
  request: NextRequest;
  status: number;
  durationMs: number;
  ip: string | null;
  idempotencyKey: string | null;
  body: unknown;
  errorCode: string | null;
}) {
  try {
    await db().from("api_requests").insert({
      request_id: input.requestId,
      api_key_id: input.apiKeyId,
      project_id: input.projectId,
      method: input.request.method,
      path: input.request.nextUrl.pathname,
      query: input.request.nextUrl.search || null,
      status_code: input.status,
      duration_ms: input.durationMs,
      ip: input.ip,
      user_agent: input.request.headers.get("user-agent"),
      idempotency_key: input.idempotencyKey,
      request_body: input.body && typeof input.body === "object" ? input.body : null,
      error_code: input.errorCode,
    });
  } catch {
    /* o log nunca pode derrubar a resposta */
  }
}

/**
 * Envolve um endpoint da API pública com autenticação por chave, verificação de
 * escopo, allowlist de IP, rate limit, idempotência, log e tratamento de erro.
 */
export function apiHandler(
  options: HandlerOptions,
  handler: (context: ApiContext) => Promise<unknown>
) {
  return async function route(request: NextRequest): Promise<NextResponse> {
    const started = Date.now();
    const requestId = `req_${randomBytes(12).toString("hex")}`;
    const ip = clientIp(request);
    const idempotencyKey = request.headers.get("idempotency-key");

    let apiKey: AuthenticatedKey | null = null;
    let body: Record<string, unknown> = {};

    function respond(payload: unknown, status: number, extraHeaders?: Record<string, string>) {
      return NextResponse.json(payload, {
        status,
        headers: {
          "X-Request-Id": requestId,
          "X-FlowDesk-Version": API_VERSION,
          "Cache-Control": "no-store",
          ...extraHeaders,
        },
      });
    }

    try {
      // ---------------------------------------------------------- autenticação
      const secret = extractSecret(request);
      if (!secret) throw Errors.missingKey();

      apiKey = await resolveApiKey(secret);
      if (!apiKey || apiKey.status !== "ACTIVE") throw Errors.invalidKey();
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) throw Errors.expiredKey();

      if (apiKey.allowed_ips.length > 0 && ip && !apiKey.allowed_ips.includes(ip)) {
        throw Errors.ipNotAllowed(ip);
      }

      if (!apiKey.scopes.includes(options.scope)) throw Errors.missingScope(options.scope);

      // ------------------------------------------------------------ rate limit
      const limit = apiKey.rate_limit_per_minute;
      const { data: hits } = await db().rpc("bump_rate_limit", {
        p_bucket: `key:${apiKey.id}`,
        p_window_seconds: 60,
      });
      const used = Number(hits ?? 0);

      if (used > limit) {
        const retryAfter = 60 - (Math.floor(Date.now() / 1000) % 60);
        throw Errors.rateLimited(limit, retryAfter);
      }

      const rateHeaders = {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(Math.max(0, limit - used)),
      };

      // ----------------------------------------------------------------- corpo
      if (request.method !== "GET" && request.method !== "DELETE") {
        const raw = await request.text();
        if (raw.trim().length > 0) {
          try {
            body = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            throw Errors.invalidJson();
          }
        }
      }

      // ---------------------------------------------------- projeto bloqueado?
      if (options.requireActiveProject) {
        const { data: project } = await db()
          .from("projects")
          .select("status")
          .eq("id", apiKey.project_id)
          .maybeSingle();
        if (project?.status === "ARCHIVED") {
          throw Errors.notFound("Projeto");
        }
      }

      // ----------------------------------------------------------- idempotência
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ path: request.nextUrl.pathname, body }))
        .digest("hex");

      if (options.idempotent && idempotencyKey) {
        const { data: existing } = await db()
          .from("idempotency_keys")
          .select("request_hash, response_status, response_body, completed_at")
          .eq("key", idempotencyKey)
          .eq("project_id", apiKey.project_id)
          .eq("endpoint", request.nextUrl.pathname)
          .maybeSingle();

        if (existing) {
          if (existing.request_hash !== requestHash) throw Errors.idempotencyConflict();
          if (existing.completed_at) {
            void logRequest({
              requestId,
              apiKeyId: apiKey.id,
              projectId: apiKey.project_id,
              request,
              status: existing.response_status ?? 200,
              durationMs: Date.now() - started,
              ip,
              idempotencyKey,
              body,
              errorCode: null,
            });
            return respond(existing.response_body, existing.response_status ?? 200, {
              ...rateHeaders,
              "Idempotent-Replay": "true",
            });
          }
        } else {
          await db().from("idempotency_keys").insert({
            key: idempotencyKey,
            api_key_id: apiKey.id,
            project_id: apiKey.project_id,
            endpoint: request.nextUrl.pathname,
            request_hash: requestHash,
            locked_at: new Date().toISOString(),
          });
        }
      }

      // ------------------------------------------------------------- execução
      const result = await handler({
        requestId,
        apiKey,
        projectId: apiKey.project_id,
        ip,
        userAgent: request.headers.get("user-agent"),
        body,
        query: request.nextUrl.searchParams,
        idempotencyKey,
      });

      const status = request.method === "POST" ? 201 : 200;
      const payload = { ...(result as object), request_id: requestId };

      if (options.idempotent && idempotencyKey) {
        await db()
          .from("idempotency_keys")
          .update({
            response_status: status,
            response_body: payload,
            completed_at: new Date().toISOString(),
          })
          .eq("key", idempotencyKey)
          .eq("project_id", apiKey.project_id)
          .eq("endpoint", request.nextUrl.pathname);
      }

      touchApiKey(apiKey.id, ip);
      void logRequest({
        requestId,
        apiKeyId: apiKey.id,
        projectId: apiKey.project_id,
        request,
        status,
        durationMs: Date.now() - started,
        ip,
        idempotencyKey,
        body,
        errorCode: null,
      });

      return respond(payload, status, rateHeaders);
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : Errors.internal(
              process.env.NODE_ENV === "production"
                ? "Erro interno ao processar a requisição."
                : (error as Error).message
            );

      if (!(error instanceof ApiError)) {
        console.error(`[flowdesk-api] ${requestId}`, error);
      }

      // libera a chave de idempotência para permitir nova tentativa
      if (options.idempotent && idempotencyKey && apiKey && apiError.status >= 500) {
        await db()
          .from("idempotency_keys")
          .delete()
          .eq("key", idempotencyKey)
          .eq("project_id", apiKey.project_id)
          .eq("endpoint", request.nextUrl.pathname)
          .then(() => undefined, () => undefined);
      }

      void logRequest({
        requestId,
        apiKeyId: apiKey?.id ?? null,
        projectId: apiKey?.project_id ?? null,
        request,
        status: apiError.status,
        durationMs: Date.now() - started,
        ip,
        idempotencyKey,
        body,
        errorCode: apiError.code,
      });

      return respond(apiError.toJSON(requestId), apiError.status);
    }
  };
}

export function optionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Api-Key, Idempotency-Key, X-Request-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** Paginação padrão de todas as listagens da API. */
export function pagination(query: URLSearchParams) {
  const limit = Math.min(Math.max(Number(query.get("limit") ?? 25), 1), 100);
  const offset = Math.max(Number(query.get("offset") ?? 0), 0);
  return { limit, offset };
}
