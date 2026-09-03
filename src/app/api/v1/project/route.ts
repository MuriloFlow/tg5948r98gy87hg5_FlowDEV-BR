import { db } from "@/lib/db";
import { apiHandler, optionsResponse } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import type { Customer, Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/project — devolve o projeto associado à chave usada. */
export const GET = apiHandler({ scope: "entitlement:read" }, async (context) => {
  const { data: project } = await db()
    .from("projects")
    .select("*")
    .eq("id", context.projectId)
    .maybeSingle();

  if (!project) throw Errors.notFound("Projeto");

  const typed = project as Project;

  const { data: customer } = await db()
    .from("customers")
    .select("id, name, email, document, type")
    .eq("id", typed.customer_id)
    .maybeSingle();

  return {
    object: "project",
    id: typed.id,
    code: typed.code,
    name: typed.name,
    slug: typed.slug,
    description: typed.description,
    status: typed.status,
    environment: typed.environment,
    primary_domain: typed.primary_domain,
    domains: typed.domains,
    block_mode: typed.block_mode,
    grace_days: typed.grace_days,
    monthly_amount: Number(typed.monthly_amount),
    currency: typed.currency,
    customer: customer
      ? {
          id: (customer as Customer).id,
          name: (customer as Customer).name,
          email: (customer as Customer).email,
          document: (customer as Customer).document,
        }
      : null,
    api_key: {
      id: context.apiKey.id,
      key_id: context.apiKey.key_id,
      name: context.apiKey.name,
      environment: context.apiKey.environment,
      scopes: context.apiKey.scopes,
      rate_limit_per_minute: context.apiKey.rate_limit_per_minute,
    },
    created_at: typed.created_at,
  };
});

export const OPTIONS = optionsResponse;
