import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, optionsResponse } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { serializeCharge } from "@/lib/api/serializers";
import type { InvoiceFull } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/charges/{id} — aceita o UUID ou o código (INV-2026-000001). */
export async function GET(
  request: NextRequest,
  segment: { params: Promise<{ id: string }> }
) {
  const { id } = await segment.params;

  return apiHandler({ scope: "charges:read" }, async (context) => {
    const isUuid = /^[0-9a-f-]{36}$/i.test(id);

    const { data } = await db()
      .from("v_invoices_full")
      .select("*")
      .eq("project_id", context.projectId)
      .eq(isUuid ? "id" : "code", id)
      .maybeSingle();

    if (!data) throw Errors.notFound("Cobrança");

    const invoice = data as InvoiceFull;

    const { data: payments } = await db()
      .from("payments")
      .select("id, status, method, amount, approved_at, created_at")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: false });

    return {
      ...serializeCharge(invoice),
      payments: (payments ?? []).map((p) => ({
        id: p.id,
        status: p.status,
        method: p.method,
        amount: Number(p.amount),
        approved_at: p.approved_at,
        created_at: p.created_at,
      })),
    };
  })(request);
}

export const OPTIONS = optionsResponse;
