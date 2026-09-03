"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Barcode,
  CalendarClock,
  Check,
  CreditCard,
  ExternalLink,
  QrCode,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/misc";
import { formatCurrency, formatDateLong, formatDocument } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PaymentSuccessScreen,
  PaymentWaitingBanner,
  usePaymentStatus,
} from "./payment-live";

type Choice = "PIX" | "CARD" | "BOLETO";

interface PixData {
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  paymentId: string;
}

export function Checkout({
  token,
  title,
  description,
  amount,
  methods,
  maxInstallments,
  checkoutUrl,
  gatewayReady,
  dueDate,
  invoiceCode,
  projectName,
  customerName,
  customerEmail,
  customerDocument,
  blocksAccess,
}: {
  token: string;
  title: string;
  description: string | null;
  amount: number;
  methods: PaymentMethod[];
  maxInstallments: number;
  checkoutUrl: string | null;
  gatewayReady: boolean;
  dueDate: string | null;
  invoiceCode: string | null;
  projectName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerDocument: string | null;
  blocksAccess: boolean;
}) {
  const allowsPix = methods.includes("PIX");
  const allowsCard = methods.includes("CREDIT_CARD") || methods.includes("DEBIT_CARD");
  const allowsBoleto = methods.includes("BOLETO");

  const [choice, setChoice] = React.useState<Choice>(
    allowsPix ? "PIX" : allowsCard ? "CARD" : "BOLETO"
  );
  const [pix, setPix] = React.useState<PixData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { paid, payload, checking, secondsSinceCheck, checkNow } = usePaymentStatus(
    token,
    true,
    { aggressive: Boolean(pix) }
  );

  async function generatePix() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/pay/${token}/pix`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar o Pix");
      setPix({
        qrCode: data.qr_code,
        qrCodeBase64: data.qr_code_base64,
        expiresAt: data.expires_at,
        paymentId: data.payment_id,
      });
      // dispara verificação imediata após gerar o QR
      void checkNow();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (paid) {
    return (
      <PaymentSuccessScreen
        token={token}
        amount={payload?.amount ?? amount}
        method={payload?.method ?? "PIX"}
        paidAt={payload?.paid_at}
        invoiceCode={payload?.invoice_code ?? invoiceCode}
        projectName={projectName}
        blocksAccess={blocksAccess}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-raised)] animate-slide-up">
      {/* ------------------------------------------------------------ resumo */}
      <div className="border-b border-ink-200 px-6 py-6 text-center">
        {blocksAccess && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-left">
            <ShieldAlert className="mt-px size-4 shrink-0 text-amber-600" />
            <p className="text-[12.5px] leading-relaxed text-amber-900">
              O acesso ao sistema está suspenso até a confirmação deste pagamento. A liberação é
              automática.
            </p>
          </div>
        )}

        <p className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink-400">
          {projectName ?? "Cobrança"}
        </p>
        <p className="mt-2 text-[38px] font-semibold leading-none tracking-[-0.035em] tabular text-ink-900">
          {formatCurrency(amount)}
        </p>
        <p className="mt-2.5 text-[14px] text-ink-700">{title}</p>
        {description && <p className="mt-1 text-[12.5px] text-ink-500">{description}</p>}

        <dl className="mt-5 space-y-1.5 border-t border-ink-200/70 pt-4 text-left">
          {customerName && (
            <Row label="Pagador" value={customerName} sub={customerEmail ?? undefined} />
          )}
          {customerDocument && (
            <Row label="Documento" value={formatDocument(customerDocument)} />
          )}
          {dueDate && (
            <Row
              label="Vencimento"
              value={formatDateLong(dueDate)}
              icon={<CalendarClock className="size-3.5" />}
            />
          )}
          {invoiceCode && <Row label="Cobrança" value={invoiceCode} mono />}
        </dl>
      </div>

      {/* ------------------------------------------------------------ métodos */}
      {!gatewayReady ? (
        <div className="px-6 py-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-6 text-amber-500" />
          <p className="text-[13.5px] font-medium text-ink-900">
            Checkout temporariamente indisponível
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            O meio de pagamento ainda não foi configurado. Entre em contato com o responsável pela
            cobrança para concluir o pagamento.
          </p>
        </div>
      ) : (
        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${[allowsPix, allowsCard, allowsBoleto].filter(Boolean).length}, minmax(0, 1fr))` }}>
            {allowsPix && (
              <MethodTab
                active={choice === "PIX"}
                onClick={() => setChoice("PIX")}
                icon={<QrCode />}
                label="Pix"
                hint="Na hora"
              />
            )}
            {allowsCard && (
              <MethodTab
                active={choice === "CARD"}
                onClick={() => setChoice("CARD")}
                icon={<CreditCard />}
                label="Cartão"
                hint={maxInstallments > 1 ? `até ${maxInstallments}x` : "à vista"}
              />
            )}
            {allowsBoleto && (
              <MethodTab
                active={choice === "BOLETO"}
                onClick={() => setChoice("BOLETO")}
                icon={<Barcode />}
                label="Boleto"
                hint="1 a 3 dias"
              />
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}

          {choice === "PIX" ? (
            pix ? (
              <div className="space-y-4 animate-fade-in">
                {pix.qrCodeBase64 && (
                  <div className="mx-auto w-fit rounded-xl border border-ink-200 bg-white p-3">
                    <Image
                      src={`data:image/png;base64,${pix.qrCodeBase64}`}
                      alt="QR Code Pix"
                      width={200}
                      height={200}
                      unoptimized
                      className="size-[200px]"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-[12px] font-medium text-ink-600">Pix copia e cola</p>
                  <div className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50/60 p-2.5">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-ink-700">
                      {pix.qrCode}
                    </code>
                    <CopyButton value={pix.qrCode} variant="secondary" size="iconSm" />
                  </div>
                </div>

                <PaymentWaitingBanner
                  checking={checking}
                  onVerify={() => void checkNow()}
                  providerStatus={payload?.provider_status}
                  secondsSinceCheck={secondsSinceCheck}
                />

                {pix.expiresAt && (
                  <p className="text-center text-[11.5px] text-ink-400">
                    Este código expira em {formatDateLong(pix.expiresAt)}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <ul className="space-y-1.5">
                  {[
                    "Confirmação imediata, sem taxas para você",
                    "Pague pelo app do seu banco em segundos",
                    "O acesso é liberado automaticamente",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[12.5px] text-ink-600">
                      <Check className="size-3.5 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button size="lg" block loading={loading} onClick={generatePix} icon={<QrCode />}>
                  Gerar QR Code Pix
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {(choice === "CARD"
                  ? [
                      maxInstallments > 1
                        ? `Parcele em até ${maxInstallments}x no cartão de crédito`
                        : "Pagamento à vista no cartão de crédito",
                      "Aprovação em poucos segundos",
                      "Ambiente seguro do Mercado Pago",
                    ]
                  : [
                      "Boleto bancário com vencimento próximo",
                      "Compensação em 1 a 3 dias úteis",
                      "Pague em qualquer banco ou lotérica",
                    ]
                ).map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[12.5px] text-ink-600">
                    <Check className="size-3.5 shrink-0 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>

              {checkoutUrl ? (
                <Button size="lg" block asChild>
                  <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                    {choice === "CARD" ? <CreditCard /> : <Barcode />}
                    {choice === "CARD" ? "Pagar com cartão" : "Gerar boleto"}
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800">
                  O checkout ainda está sendo preparado. Atualize a página em alguns instantes ou
                  use o Pix.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  mono,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-500">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 text-right">
        <span
          className={cn(
            "block truncate text-[12.5px] font-medium text-ink-800",
            mono && "font-mono text-[12px]"
          )}
        >
          {value}
        </span>
        {sub && <span className="block truncate text-[11.5px] text-ink-400">{sub}</span>}
      </dd>
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition-all duration-150",
        active
          ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
          : "border-ink-200 hover:border-ink-300 hover:bg-ink-50/60"
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
          active ? "bg-brand-100 text-brand-600" : "bg-ink-100 text-ink-400"
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[12.5px] font-medium",
          active ? "text-brand-700" : "text-ink-700"
        )}
      >
        {label}
      </span>
      <span className="text-[10.5px] text-ink-400">{hint}</span>
    </button>
  );
}
