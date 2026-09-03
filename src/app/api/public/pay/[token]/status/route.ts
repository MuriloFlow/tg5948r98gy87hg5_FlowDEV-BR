import { NextResponse, type NextRequest } from "next/server";
import { resolveLinkPaymentStatus } from "@/lib/payment-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/public/pay/{token}/status
 *
 * Polling leve do checkout: lê o banco e, no máximo a cada ~10s por link,
 * reconcilia com o Mercado Pago no servidor (sem flood).
 */
export async function GET(
  _request: NextRequest,
  segment: { params: Promise<{ token: string }> }
) {
  const { token } = await segment.params;

  try {
    const result = await resolveLinkPaymentStatus(token, { sync: "if-due" });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("[flowdesk] status checkout:", (error as Error).message);
    return NextResponse.json(
      { paid: false, status: "PENDING", error: (error as Error).message },
      { status: 200 }
    );
  }
}
