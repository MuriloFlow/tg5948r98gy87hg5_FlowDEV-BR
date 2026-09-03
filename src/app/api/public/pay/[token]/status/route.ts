import { NextResponse, type NextRequest } from "next/server";
import { resolveLinkPaymentStatus } from "@/lib/payment-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/public/pay/{token}/status
 *
 * Consultado pelo checkout a cada poucos segundos. Força sincronização com o
 * Mercado Pago para confirmar Pix em tempo real mesmo sem webhook público.
 */
export async function GET(
  _request: NextRequest,
  segment: { params: Promise<{ token: string }> }
) {
  const { token } = await segment.params;

  try {
    const result = await resolveLinkPaymentStatus(token, { forceSync: true });

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
