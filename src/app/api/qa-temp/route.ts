// TEMPORÁRIO — dispara as Server Actions reais do painel para verificação. Remover ao final.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createCustomerAction } from "@/server/customers";
import { createProjectAction } from "@/server/projects";
import { createInvoiceAction, generatePaymentLinkAction } from "@/server/invoices";
import {
  createStandaloneLinkAction,
  disableLinkAction,
  extendExpirationAction,
  regenerateCheckoutAction,
} from "@/server/payment-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toFormData(payload: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) for (const item of value) form.append(key, String(item));
    else if (value !== null && value !== undefined) form.append(key, String(value));
  }
  return form;
}

export async function POST(request: NextRequest) {
  const { op, payload = {} } = (await request.json()) as {
    op: string;
    payload?: Record<string, unknown>;
  };

  try {
    switch (op) {
      case "customer":
        return NextResponse.json(await createCustomerAction(null, toFormData(payload)));
      case "project":
        return NextResponse.json(await createProjectAction(null, toFormData(payload)));
      case "invoice":
        return NextResponse.json(await createInvoiceAction(null, toFormData(payload)));
      case "link":
        return NextResponse.json(await createStandaloneLinkAction(null, toFormData(payload)));
      case "ensure-link":
        return NextResponse.json(
          await generatePaymentLinkAction(String(payload.id), {
            forceNew: Boolean(payload.forceNew),
          })
        );
      case "regenerate":
        return NextResponse.json(await regenerateCheckoutAction(String(payload.id)));
      case "extend":
        return NextResponse.json(
          await extendExpirationAction(String(payload.id), Number(payload.days ?? 7))
        );
      case "disable":
        return NextResponse.json(await disableLinkAction(String(payload.id)));
      case "invoice-state": {
        const { data } = await db()
          .from("invoices")
          .select("id, code, status, total, paid_amount")
          .eq("id", String(payload.id))
          .maybeSingle();
        return NextResponse.json({ ok: true, data });
      }
      case "links-for-invoice": {
        const { data } = await db()
          .from("payment_links")
          .select("id, token, status, checkout_url, provider_preference_id, amount, expires_at")
          .eq("invoice_id", String(payload.id));
        return NextResponse.json({ ok: true, data });
      }
      default:
        return NextResponse.json({ ok: false, error: `op desconhecida: ${op}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, stack: (error as Error).stack },
      { status: 500 }
    );
  }
}
