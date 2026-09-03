export type ApiErrorType =
  | "authentication_error"
  | "permission_error"
  | "invalid_request_error"
  | "rate_limit_error"
  | "idempotency_error"
  | "not_found_error"
  | "gateway_error"
  | "api_error";

export class ApiError extends Error {
  constructor(
    readonly type: ApiErrorType,
    readonly code: string,
    message: string,
    readonly status: number,
    readonly param?: string,
    readonly docsUrl?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON(requestId: string) {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
        ...(this.param ? { param: this.param } : {}),
        ...(this.docsUrl ? { doc_url: this.docsUrl } : {}),
      },
      request_id: requestId,
    };
  }
}

export const Errors = {
  missingKey: () =>
    new ApiError(
      "authentication_error",
      "missing_api_key",
      "Nenhuma chave de API foi enviada. Use o header Authorization: Bearer fd_live_sk_...",
      401,
      undefined,
      "/documentacao#autenticacao"
    ),

  invalidKey: () =>
    new ApiError(
      "authentication_error",
      "invalid_api_key",
      "Chave de API inválida ou revogada.",
      401
    ),

  expiredKey: () =>
    new ApiError("authentication_error", "expired_api_key", "Esta chave de API expirou.", 401),

  ipNotAllowed: (ip: string) =>
    new ApiError(
      "permission_error",
      "ip_not_allowed",
      `O IP ${ip} não está na lista de IPs permitidos desta chave.`,
      403
    ),

  missingScope: (scope: string) =>
    new ApiError(
      "permission_error",
      "insufficient_scope",
      `Esta chave não possui o escopo obrigatório "${scope}".`,
      403
    ),

  rateLimited: (limit: number, retryAfter: number) =>
    new ApiError(
      "rate_limit_error",
      "rate_limit_exceeded",
      `Limite de ${limit} requisições por minuto excedido. Tente novamente em ${retryAfter}s.`,
      429
    ),

  invalidJson: () =>
    new ApiError(
      "invalid_request_error",
      "invalid_json",
      "O corpo da requisição não é um JSON válido.",
      400
    ),

  validation: (message: string, param?: string) =>
    new ApiError("invalid_request_error", "validation_error", message, 422, param),

  notFound: (resource: string) =>
    new ApiError("not_found_error", "resource_not_found", `${resource} não encontrado.`, 404),

  idempotencyConflict: () =>
    new ApiError(
      "idempotency_error",
      "idempotency_key_in_use",
      "Esta Idempotency-Key já está sendo processada com um corpo diferente.",
      409
    ),

  projectBlocked: () =>
    new ApiError(
      "permission_error",
      "project_blocked",
      "Este projeto está bloqueado por falta de pagamento e não pode criar novas cobranças.",
      403
    ),

  gateway: (message: string) =>
    new ApiError("gateway_error", "gateway_error", message, 502),

  internal: (message: string) =>
    new ApiError("api_error", "internal_error", message, 500),
};
