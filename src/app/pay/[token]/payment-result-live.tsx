"use client";

import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { PaymentSuccessScreen, usePaymentStatus } from "./payment-live";

const STATIC = {
  pending: {
    wrap: "border-amber-200",
    tint: "bg-amber-50 text-amber-600",
    title: "Pagamento em processamento",
    text: "Seu pagamento foi registrado e está sendo processado pelo banco. Assim que for confirmado, o acesso é liberado automaticamente. Boletos podem levar até 3 dias úteis.",
    icon: <Clock />,
  },
  failure: {
    wrap: "border-rose-200",
    tint: "bg-rose-50 text-rose-600",
    title: "Não conseguimos concluir o pagamento",
    text: "A operadora recusou a transação ou ela foi cancelada. Nenhum valor foi cobrado. Você pode tentar novamente com outro meio de pagamento.",
    icon: <AlertTriangle />,
  },
} as const;

export function PaymentResultLive({
  variant,
  token,
  amount,
  projectName,
  blocksAccess,
}: {
  variant: "success" | "pending" | "failure";
  token: string;
  amount?: number;
  projectName?: string | null;
  blocksAccess?: boolean;
}) {
  const { paid, payload, checking, checkNow } = usePaymentStatus(
    token,
    variant === "success" || variant === "pending"
  );

  if (variant === "success" && (paid || payload?.paid)) {
    return (
      <main className="surface-auth flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="w-full max-w-[480px]">
          <header className="mb-6 flex items-center justify-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink-900">
              FlowDesk
            </span>
          </header>
          <PaymentSuccessScreen
            token={token}
            amount={payload?.amount ?? amount ?? 0}
            method={payload?.method}
            paidAt={payload?.paid_at}
            invoiceCode={payload?.invoice_code}
            projectName={projectName}
            blocksAccess={blocksAccess}
            redirectToSuccess={false}
          />
        </div>
      </main>
    );
  }

  if (variant === "pending" && paid) {
    return (
      <PaymentResultLive
        variant="success"
        token={token}
        amount={payload?.amount ?? amount}
        projectName={projectName}
        blocksAccess={blocksAccess}
      />
    );
  }

  const config =
    variant === "success"
      ? {
          wrap: "border-brand-200",
          tint: "bg-brand-50 text-brand-600",
          title: "Confirmando pagamento...",
          text: "Estamos verificando a confirmação com o Mercado Pago. Isso costuma levar poucos segundos.",
          icon: <Clock className="animate-pulse" />,
        }
      : STATIC[variant];

  return (
    <main className="surface-auth flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[460px]">
        <header className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink-900">
            FlowDesk
          </span>
        </header>

        <div
          className={`rounded-2xl border bg-white p-8 text-center shadow-[var(--shadow-raised)] animate-scale-in ${config.wrap}`}
        >
          <span
            className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl [&_svg]:size-6 ${config.tint}`}
          >
            {config.icon}
          </span>
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
            {config.title}
          </h1>
          <p className="mx-auto mt-2.5 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
            {config.text}
          </p>

          {(variant === "success" || variant === "pending") && (
            <Button
              className="mt-6"
              variant="secondary"
              block
              loading={checking}
              onClick={() => void checkNow()}
            >
              Verificar pagamento agora
            </Button>
          )}

          {variant === "failure" && (
            <Button className="mt-6" block asChild>
              <Link href={`/pay/${token}`}>Voltar ao pagamento</Link>
            </Button>
          )}
        </div>

        <p className="mt-6 text-center text-[11.5px] text-ink-400">
          Guarde o comprovante enviado pelo Mercado Pago para os seus registros.
        </p>
      </div>
    </main>
  );
}
