import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, optionsResponse, pagination } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { listEnvelope, serializePaymentLink } from "@/lib/api/serializers";
import { createPaymentLink, ensurePaymentLink } from "@/lib/billing";
import type { PaymentLink } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    charge_id: z.string().uuid().optional(),
    title: z.string().trim().min(3).optional(),
    description: z.string().trim().optional().nullable(),
    amount: z.number().positive().optional(),
    payment_methods: z
      .array(z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO", "ACCOUNT_MONEY"]))
      .optional(),
    max_installments: z.number().int().min(1).max(24).optional(),
    expires_at: z.string().optional().nullable(),
    max_uses: z.number().int().min(1).optional(),
    force_new: z.boolean().optional(),
  })
  .refine((data) => data.charge_id || (data.title && data.amount), {
    message: "Informe charge_id, ou title + amount para um link avulso",
  });

/** GET /api/v1/payment-links */
export const GET = apiHandler({ scope: "links:write" }, async (context) => {
  const { limit, offset } = pagination(context.query);
  const status = context.query.get("status");

  let query = db()
    .from("payment_links")
    .select("*", { count: "exact" })
    .eq("project_id", context.projectId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.in("status", status.split(","));

  const { data, count, error } = await query;
  if (error) throw Errors.internal(error.message);

  return listEnvelope(
    ((data ?? []) as PaymentLink[]).map(serializePaymentLink),
    count ?? 0,
    limit,
    offset
  );
});

/** POST /api/v1/payment-links — a partir de uma cobrança ou avulso. */
export const POST = apiHandler(
  { scope: "links:write", idempotent: true, requireActiveProject: true },
  async (context) => {
    const parsed = createSchema.safeParse(context.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw Errors.validation(issue.message, issue.path.join("."));
    }

    const input = parsed.data;

    if (input.charge_id) {
      const { data: invoice } = await db()
        .from("invoices")
        .select("id")
        .eq("id", input.charge_id)
        .eq("project_id", context.projectId)
        .maybeSingle();

      if (!invoice) throw Errors.notFound("Cobrança");

      const link = await ensurePaymentLink(input.charge_id, {
        forceNew: input.force_new ?? false,
        createdVia: "API",
      });
      return serializePaymentLink(link);
    }

    const link = await createPaymentLink({
      projectId: context.projectId,
      title: input.title!,
      description: input.description ?? null,
      amount: input.amount!,
      paymentMethods: input.payment_methods ?? ["PIX", "CREDIT_CARD", "BOLETO"],
      maxInstallments: input.max_installments ?? 12,
      expiresAt: input.expires_at ?? null,
      maxUses: input.max_uses ?? 1,
      createdVia: "API",
    });

    return serializePaymentLink(link);
  }
);

export const OPTIONS = optionsResponse;
