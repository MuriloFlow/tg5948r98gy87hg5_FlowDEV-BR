"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/labels";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PaymentStatusPayload {
  paid: boolean;
  status: string;
  amount?: number;
  method?: PaymentMethod | null;
  paid_at?: string | null;
  invoice_code?: string | null;
  synced?: boolean;
  provider_status?: string | null;
  sync_errors?: string[];
  provider_checked?: boolean;
}

/** Rede de segurança caso o stream de eventos seja bloqueado por proxy. */
const FALLBACK_POLL_MS = 4_000;
/** Tempo sem notícias do stream antes de acionar o polling de reserva. */
const STREAM_STALE_MS = 8_000;

const PROVIDER_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  in_process: "Processando no banco",
  approved: "Aprovado pelo Mercado Pago",
  authorized: "Autorizado",
  rejected: "Recusado",
  cancelled: "Cancelado",
};

export function usePaymentStatus(token: string, enabled: boolean) {
  const [payload, setPayload] = React.useState<PaymentStatusPayload | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [lastCheckedAt, setLastCheckedAt] = React.useState<number | null>(null);
  const [secondsSinceCheck, setSecondsSinceCheck] = React.useState<number | null>(null);
  const [visible, setVisible] = React.useState(true);

  const paid = payload?.paid === true;
  const lastEventAt = React.useRef(0);

  const apply = React.useCallback((data: PaymentStatusPayload) => {
    lastEventAt.current = Date.now();
    setPayload(data);
    setLastCheckedAt(Date.now());
  }, []);

  const check = React.useCallback(
    async (force = false) => {
      if (force) setChecking(true);
      try {
        const endpoint = force
          ? `/api/public/pay/${token}/sync`
          : `/api/public/pay/${token}/status`;
        const response = await fetch(endpoint, {
          method: force ? "POST" : "GET",
          cache: "no-store",
        });
        if (!response.ok) return null;
        const data = (await response.json()) as PaymentStatusPayload;
        apply(data);
        return data;
      } catch {
        return null;
      } finally {
        if (force) setChecking(false);
      }
    },
    [apply, token]
  );

  React.useEffect(() => {
    if (!lastCheckedAt) {
      const resetId = window.setTimeout(() => setSecondsSinceCheck(null), 0);
      return () => clearTimeout(resetId);
    }

    const update = () => {
      setSecondsSinceCheck(Math.max(0, Math.round((Date.now() - lastCheckedAt) / 1000)));
    };

    const timeoutId = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [lastCheckedAt]);

  React.useEffect(() => {
    const onVisible = () => setVisible(document.visibilityState === "visible");
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Canal principal: o servidor empurra a confirmação assim que ela acontece.
  React.useEffect(() => {
    if (!enabled || !visible || paid || typeof EventSource === "undefined") return;

    const source = new EventSource(`/api/public/pay/${token}/stream`);

    source.addEventListener("status", (event) => {
      try {
        apply(JSON.parse((event as MessageEvent).data) as PaymentStatusPayload);
      } catch {
        // payload malformado — o polling de reserva cobre o caso
      }
    });

    source.addEventListener("failed", () => source.close());

    return () => source.close();
  }, [apply, enabled, paid, token, visible]);

  // Reserva: só dispara quando o stream fica em silêncio (proxy bloqueando SSE).
  React.useEffect(() => {
    if (!enabled || !visible || paid) return;

    const timeoutId = window.setTimeout(() => void check(), 0);
    const interval = window.setInterval(() => {
      if (Date.now() - lastEventAt.current > STREAM_STALE_MS) void check();
    }, FALLBACK_POLL_MS);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [check, enabled, paid, visible]);

  return {
    paid,
    payload,
    checking,
    lastCheckedAt,
    secondsSinceCheck,
    checkNow: () => check(true),
  };
}

export function PaymentWaitingBanner({
  checking,
  onVerify,
  providerStatus,
  secondsSinceCheck,
  syncErrors,
  compact,
}: {
  checking: boolean;
  onVerify: () => void;
  providerStatus?: string | null;
  secondsSinceCheck?: number | null;
  syncErrors?: string[];
  compact?: boolean;
}) {
  const providerLabel = providerStatus
    ? PROVIDER_LABEL[providerStatus] ?? `Status: ${providerStatus}`
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-brand-200/80 bg-gradient-to-b from-brand-50/80 to-white",
        compact ? "px-3.5 py-3" : "px-4 py-4"
      )}
    >
      <div className="flex items-center justify-center gap-2 text-[13px] font-medium text-brand-700">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full rounded-full bg-brand-400 opacity-75 animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-brand-500" />
        </span>
        Aguardando confirmação do Pix
      </div>
      <p className="mt-1.5 text-center text-[12px] leading-relaxed text-ink-500">
        {providerLabel
          ? `${providerLabel}. Assim que o banco confirmar, esta tela atualiza sozinha.`
          : "O sistema monitora o pagamento automaticamente — geralmente em poucos segundos."}
      </p>
      {secondsSinceCheck != null && (
        <p className="mt-1 text-center text-[11px] text-ink-400">
          Atualizado há {secondsSinceCheck === 0 ? "instantes" : `${secondsSinceCheck}s`}
        </p>
      )}
      {syncErrors && syncErrors.length > 0 && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
          Falha ao consultar o gateway: {syncErrors[0]}
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        block
        className="mt-3"
        loading={checking}
        onClick={onVerify}
        icon={<RefreshCw />}
      >
        Já paguei, verificar agora
      </Button>
    </div>
  );
}

export function PaymentSuccessScreen({
  token,
  amount,
  method,
  paidAt,
  invoiceCode,
  projectName,
  blocksAccess,
  redirectToSuccess = true,
}: {
  token: string;
  amount: number;
  method?: PaymentMethod | null;
  paidAt?: string | null;
  invoiceCode?: string | null;
  projectName?: string | null;
  blocksAccess?: boolean;
  redirectToSuccess?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<"celebrate" | "release">("celebrate");

  React.useEffect(() => {
    const releaseTimer = setTimeout(() => setStep("release"), 1200);
    const redirectTimer = setTimeout(() => {
      if (redirectToSuccess) router.replace(`/pay/${token}/sucesso`);
    }, 2800);

    return () => {
      clearTimeout(releaseTimer);
      clearTimeout(redirectTimer);
    };
  }, [redirectToSuccess, router, token]);

  const methodLabel = method ? PAYMENT_METHOD[method]?.label ?? method : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white text-center shadow-[var(--shadow-raised)] animate-scale-in">
      <div className="relative px-6 py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-50 to-transparent"
        />
        <span className="relative mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
          <CheckCircle2 className="size-8 animate-[scale-in_0.35s_cubic-bezier(0.16,1,0.3,1)]" />
        </span>
        <h1 className="relative text-[22px] font-semibold tracking-[-0.02em] text-ink-900">
          Pagamento aprovado
        </h1>
        <p className="relative mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
          Recebemos {formatCurrency(amount)}
          {projectName ? ` referente a ${projectName}` : ""}.
        </p>

        <dl className="relative mx-auto mt-5 max-w-xs space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-left text-[12.5px]">
          {methodLabel && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Forma</dt>
              <dd className="font-medium text-ink-900">{methodLabel}</dd>
            </div>
          )}
          {paidAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Confirmado em</dt>
              <dd className="font-medium tabular text-ink-900">{formatDateTime(paidAt)}</dd>
            </div>
          )}
          {invoiceCode && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Cobrança</dt>
              <dd className="font-mono text-[12px] text-ink-800">{invoiceCode}</dd>
            </div>
          )}
        </dl>

        {blocksAccess && (
          <p className="relative mt-4 flex items-center justify-center gap-2 text-[12.5px] text-emerald-700">
            {step === "release" ? (
              <>
                <ShieldCheck className="size-4" />
                Acesso liberado — você já pode voltar ao sistema.
              </>
            ) : (
              <>
                <Loader2 className="size-4 animate-spin" />
                Liberando o acesso automaticamente...
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
