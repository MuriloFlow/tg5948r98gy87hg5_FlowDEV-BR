import { db } from "@/lib/db";
import { apiHandler, optionsResponse, pagination } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { listEnvelope, serializePayment } from "@/lib/api/serializers";
import type { Payment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/payments — transações do projeto. */
export const GET = apiHandler({ scope: "payments:read" }, async (context) => {
  const { limit, offset } = pagination(context.query);
  const status = context.query.get("status");
  const chargeId = context.query.get("charge_id");

  let query = db()
    .from("payments")
    .select("*", { count: "exact" })
    .eq("project_id", context.projectId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.in("status", status.split(","));
  if (chargeId) query = query.eq("invoice_id", chargeId);

  const { data, count, error } = await query;
  if (error) throw Errors.internal(error.message);

  return listEnvelope(
    ((data ?? []) as Payment[]).map(serializePayment),
    count ?? 0,
    limit,
    offset
  );
});

export const OPTIONS = optionsResponse;
