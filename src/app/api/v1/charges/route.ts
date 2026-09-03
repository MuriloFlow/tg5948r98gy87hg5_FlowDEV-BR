import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, optionsResponse, pagination } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { listEnvelope, serializeCharge } from "@/lib/api/serializers";
import { createInvoice, ensurePaymentLink } from "@/lib/billing";
import type { InvoiceFull } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  description: z.string().trim().min(3, "Informe a descrição da cobrança"),
  amount: z.number().positive("O valor precisa ser maior que zero"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
  reference: z.string().trim().optional().nullable(),
  discount: z.number().min(0).optional(),
  is_mandatory: z.boolean().optional(),
  payment_methods: z
    .array(z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO", "ACCOUNT_MONEY"]))
    .optional(),
  max_installments: z.number().int().min(1).max(24).optional(),
  expires_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  create_payment_link: z.boolean().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit_amount: z.number().min(0),
      })
    )
    .optional(),
});

/** GET /api/v1/charges — lista as cobranças do projeto da chave. */
export const GET = apiHandler({ scope: "charges:read" }, async (context) => {
  const { limit, offset } = pagination(context.query);
  const status = context.query.get("status");
  const from = context.query.get("due_from");
  const to = context.query.get("due_to");

  let query = db()
    .from("v_invoices_full")
    .select("*", { count: "exact" })
    .eq("project_id", context.projectId)
    .order("due_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.in("status", status.split(","));
  if (from) query = query.gte("due_date", from);
  if (to) query = query.lte("due_date", to);

  const { data, count, error } = await query;
  if (error) throw Errors.internal(error.message);

  return listEnvelope(
    ((data ?? []) as InvoiceFull[]).map(serializeCharge),
    count ?? 0,
    limit,
    offset
  );
});

/** POST /api/v1/charges — cria uma cobrança (idempotente via Idempotency-Key). */
export const POST = apiHandler(
  { scope: "charges:write", idempotent: true, requireActiveProject: true },
  async (context) => {
    const parsed = createSchema.safeParse(context.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw Errors.validation(issue.message, issue.path.join("."));
    }

    const input = parsed.data;

    const invoice = await createInvoice({
      projectId: context.projectId,
      description: input.description,
      amount: input.amount,
      dueDate: input.due_date,
      reference: input.reference ?? null,
      discountAmount: input.discount ?? 0,
      isMandatory: input.is_mandatory ?? true,
      paymentMethods: input.payment_methods ?? ["PIX", "CREDIT_CARD", "BOLETO"],
      maxInstallments: input.max_installments ?? 12,
      expiresAt: input.expires_at ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      createdVia: "API",
      idempotencyKey: context.idempotencyKey,
      items: input.items?.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unit_amount,
      })),
    });

    let paymentUrl: string | null = null;
    let checkoutUrl: string | null = null;

    if (input.create_payment_link !== false) {
      try {
        const link = await ensurePaymentLink(invoice.id, { createdVia: "API" });
        checkoutUrl = link.checkout_url;
        paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/pay/${link.token}`;
      } catch (error) {
        console.warn("[flowdesk-api] link não criado:", (error as Error).message);
      }
    }

    // relê para pegar o total já normalizado pelos triggers
    const { data: fresh } = await db()
      .from("v_invoices_full")
      .select("*")
      .eq("id", invoice.id)
      .maybeSingle();

    const serialized = serializeCharge((fresh as InvoiceFull) ?? invoice);
    return {
      ...serialized,
      checkout_url: checkoutUrl ?? serialized.checkout_url,
      payment_url: paymentUrl ?? serialized.payment_url,
    };
  }
);

export const OPTIONS = optionsResponse;
