import type { NextRequest } from "next/server";
import { resolveLinkPaymentStatus } from "@/lib/payment-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intervalo entre verificações dentro do stream. */
const TICK_MS = 2_000;
/** Duração máxima da conexão — o EventSource reconecta sozinho depois disso. */
const MAX_DURATION_MS = 110_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /api/public/pay/{token}/stream
 *
 * Server-Sent Events: o servidor acompanha o pagamento e empurra o resultado
 * assim que ele é confirmado. Uma única conexão por pagador substitui o
 * polling agressivo — a frequência de consulta ao gateway fica no backend.
 */
export async function GET(
  request: NextRequest,
  segment: { params: Promise<{ token: string }> }
) {
  const { token } = await segment.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // conexão já encerrada pelo cliente
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      request.signal.addEventListener("abort", close);

      const deadline = Date.now() + MAX_DURATION_MS;

      try {
        while (!closed && Date.now() < deadline) {
          const result = await resolveLinkPaymentStatus(token, { sync: "if-due" });

          if ("error" in result) {
            send("failed", { error: result.error });
            break;
          }

          send("status", result);

          if (result.paid) break;

          await sleep(TICK_MS);
        }
      } catch (error) {
        send("failed", { error: (error as Error).message });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
