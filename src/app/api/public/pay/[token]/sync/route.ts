import { NextResponse, type NextRequest } from "next/server";
import { resolveLinkPaymentStatus } from "@/lib/payment-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ip(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * POST /api/public/pay/{token}/sync
 *
 * Disparado manualmente pelo botão "Já paguei, verificar agora".
 * Força reconciliação imediata com o Mercado Pago.
 */
export async function POST(
  request: NextRequest,
  segment: { params: Promise<{ token: string }> }
) {
  const { token } = await segment.params;
  const clientIp = ip(request);

  // rate limit leve — evita abuso sem bloquear uso legítimo
  if (clientIp) {
    const key = `sync:${clientIp}:${token}`;
    const hits = globalThis as unknown as { __flowdeskSyncHits?: Map<string, number[]> };
    if (!hits.__flowdeskSyncHits) hits.__flowdeskSyncHits = new Map();
    const now = Date.now();
    const window = hits.__flowdeskSyncHits.get(key) ?? [];
    const recent = window.filter((t) => now - t < 60_000);
    if (recent.length >= 20) {
      return NextResponse.json(
        { error: "Muitas verificações. Aguarde alguns segundos." },
        { status: 429 }
      );
    }
    recent.push(now);
    hits.__flowdeskSyncHits.set(key, recent);
  }

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
    console.error("[flowdesk] sync checkout:", (error as Error).message);
    return NextResponse.json(
      { paid: false, status: "PENDING", error: (error as Error).message },
      { status: 200 }
    );
  }
}
