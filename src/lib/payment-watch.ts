import "server-only";

import { syncPaymentsForLink } from "./payment-sync";

/**
 * Intervalo mínimo entre chamadas ao Mercado Pago por link.
 * Compartilhado por todas as abas/dispositivos que acompanham o mesmo link,
 * então a frequência real no gateway não cresce com o número de espectadores.
 */
const SYNC_COOLDOWN_MS = 2_500;

type SyncResult = Awaited<ReturnType<typeof syncPaymentsForLink>>;

const lastSyncAt = new Map<string, number>();
const inflight = new Map<string, Promise<SyncResult>>();

/** Evita vazamento em processos longos: limpa entradas antigas do mapa. */
function prune() {
  if (lastSyncAt.size < 500) return;
  const cutoff = Date.now() - 30 * 60_000;
  for (const [key, at] of lastSyncAt) {
    if (at < cutoff) lastSyncAt.delete(key);
  }
}

/**
 * Sincroniza pagamentos pendentes de um link respeitando o cooldown.
 * Chamadas simultâneas compartilham a mesma requisição em voo.
 */
export async function syncLinkIfDue(
  linkId: string,
  force = false
): Promise<{ ran: boolean; result: SyncResult | null }> {
  const pending = inflight.get(linkId);
  if (pending) {
    return { ran: true, result: await pending };
  }

  const last = lastSyncAt.get(linkId) ?? 0;
  if (!force && Date.now() - last < SYNC_COOLDOWN_MS) {
    return { ran: false, result: null };
  }

  const job = syncPaymentsForLink(linkId)
    .then((result) => {
      lastSyncAt.set(linkId, Date.now());
      prune();
      return result;
    })
    .finally(() => {
      inflight.delete(linkId);
    });

  inflight.set(linkId, job);
  return { ran: true, result: await job };
}

/** Zera o cooldown — usado logo após gerar um Pix novo. */
export function resetLinkSyncCooldown(linkId: string): void {
  lastSyncAt.delete(linkId);
}
