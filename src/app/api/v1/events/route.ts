import { db } from "@/lib/db";
import { apiHandler, optionsResponse, pagination } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { listEnvelope } from "@/lib/api/serializers";
import type { FlowEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/events — permite que a aplicação integrada faça polling dos
 * eventos caso não queira expor um endpoint de webhook.
 */
export const GET = apiHandler({ scope: "entitlement:read" }, async (context) => {
  const { limit, offset } = pagination(context.query);
  const type = context.query.get("type");
  const since = context.query.get("since");

  let query = db()
    .from("events")
    .select("*", { count: "exact" })
    .eq("project_id", context.projectId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.in("type", type.split(","));
  if (since) query = query.gte("created_at", since);

  const { data, count, error } = await query;
  if (error) throw Errors.internal(error.message);

  return listEnvelope(
    ((data ?? []) as FlowEvent[]).map((event) => ({
      object: "event",
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      data: {
        object_type: event.resource_type,
        object_id: event.resource_id,
        ...event.payload,
      },
    })),
    count ?? 0,
    limit,
    offset
  );
});

export const OPTIONS = optionsResponse;
