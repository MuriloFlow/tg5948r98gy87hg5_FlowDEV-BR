import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, optionsResponse } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { serializeCharge } from "@/lib/api/serializers";
import { cancelInvoice } from "@/lib/billing";
import type { Invoice } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/charges/{id}/cancel */
export async function POST(
  request: NextRequest,
  segment: { params: Promise<{ id: string }> }
) {
  const { id } = await segment.params;

  return apiHandler({ scope: "charges:write", idempotent: true }, async (context) => {
    const { data } = await db()
      .from("invoices")
      .select("id, status")
      .eq("project_id", context.projectId)
      .eq("id", id)
      .maybeSingle();

    if (!data) throw Errors.notFound("Cobrança");
    if (data.status === "PAID") {
      throw Errors.validation("Cobranças já pagas não podem ser canceladas. Use um estorno.");
    }

    const invoice = await cancelInvoice({
      invoiceId: id,
      reason: (context.body.reason as string) ?? "Cancelada via API",
    });

    return serializeCharge(invoice as Invoice);
  })(request);
}

export const OPTIONS = optionsResponse;
