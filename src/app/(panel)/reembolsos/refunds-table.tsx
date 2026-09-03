"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ExternalLink,
  MoreHorizontal,
  Receipt,
  RefreshCcw,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, CopyButton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { refundPaymentAction, registerChargebackAction } from "@/server/payments";
import { PAYMENT_METHOD, type StatusMeta } from "@/lib/labels";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

export interface RefundRow {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  amount: number;
  reason: string | null;
  provider_refund_id: string | null;
  status: string;
  created_at: string;
  payment_method: PaymentMethod;
  payment_amount: number;
  payment_provider_id: string | null;
  customer_name: string;
  project_name: string;
  invoice_code: string | null;
}

export interface RefundablePayment {
  id: string;
  amount: number;
  refunded_amount: number;
  method: PaymentMethod;
  provider: string;
  provider_payment_id: string | null;
  customer_name: string;
  project_name: string;
  invoice_code: string | null;
  created_at: string;
}

/** O status do estorno é texto livre (vem do gateway) — normalizamos aqui. */
export function refundStatusMeta(status: string): StatusMeta {
  const key = (status ?? "").toUpperCase();
  switch (key) {
    case "APPROVED":
    case "SUCCEEDED":
      return { label: "Aprovado", tone: "success" };
    case "PENDING":
    case "IN_PROCESS":
      return { label: "Processando", tone: "warning" };
    case "CANCELLED":
    case "CANCELED":
      return { label: "Cancelado", tone: "neutral" };
    case "REJECTED":
    case "FAILED":
      return { label: "Recusado", tone: "danger" };
    case "CHARGED_BACK":
      return { label: "Chargeback", tone: "danger" };
    default:
      return { label: key || "—", tone: "neutral" };
  }
}

function NewRefundModal({
  open,
  onOpenChange,
  payments,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payments: RefundablePayment[];
  mode: "refund" | "chargeback";
}) {
  const router = useRouter();
  const [paymentId, setPaymentId] = React.useState(payments[0]?.id ?? "");
  const [amount, setAmount] = React.useState(
    payments[0] ? Number(payments[0].amount) - Number(payments[0].refunded_amount ?? 0) : 0
  );
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const selected = payments.find((payment) => payment.id === paymentId) ?? null;
  const available = selected
    ? Math.max(Number(selected.amount) - Number(selected.refunded_amount ?? 0), 0)
    : 0;

  function pick(id: string) {
    setPaymentId(id);
    const payment = payments.find((row) => row.id === id);
    if (payment) {
      setAmount(Math.max(Number(payment.amount) - Number(payment.refunded_amount ?? 0), 0));
    }
  }

  async function submit() {
    if (!paymentId) {
      toast.error("Selecione o pagamento a estornar.");
      return;
    }
    setBusy(true);
    const result =
      mode === "chargeback"
        ? await registerChargebackAction({ paymentId, amount, reason })
        : await refundPaymentAction({ paymentId, amount, reason });
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Registrado");
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "chargeback" ? "Registrar chargeback" : "Novo estorno"}
      description={
        mode === "chargeback"
          ? "Registre uma contestação recebida do emissor do cartão. Nenhuma chamada é feita ao gateway."
          : "Selecione um pagamento aprovado e devolva o valor total ou parcial ao cliente."
      }
      size="md"
      locked={busy}
      icon={mode === "chargeback" ? <AlertTriangle /> : <Undo2 />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => void submit()}
            disabled={payments.length === 0}
          >
            {mode === "chargeback" ? "Registrar chargeback" : "Estornar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {payments.length === 0 ? (
          <p className="rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3 text-[13px] text-ink-600">
            Não há pagamentos aprovados disponíveis para estorno no momento.
          </p>
        ) : (
          <>
            <Field label="Pagamento" htmlFor="refund-payment" required>
              <NativeSelect
                id="refund-payment"
                value={paymentId}
                onChange={(event) => pick(event.target.value)}
              >
                {payments.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {payment.customer_name} · {PAYMENT_METHOD[payment.method].label} ·{" "}
                    {formatCurrency(payment.amount)}
                    {payment.invoice_code ? ` · ${payment.invoice_code}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {selected && (
              <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3 text-[12.5px]">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{selected.project_name}</p>
                  <p className="truncate font-mono text-[11.5px] text-ink-400">
                    {selected.provider_payment_id ?? selected.provider}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] uppercase tracking-wide text-ink-400">Disponível</p>
                  <p className="text-[15px] font-semibold tabular text-ink-900">
                    {formatCurrency(available)}
                  </p>
                </div>
              </div>
            )}

            <Field
              label="Valor"
              htmlFor="refund-new-amount"
              hint="Estornos parciais são permitidos"
              required
            >
              <CurrencyInput id="refund-new-amount" value={amount} onValueChange={setAmount} />
            </Field>

            <Field label="Motivo" htmlFor="refund-new-reason">
              <Textarea
                id="refund-new-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  mode === "chargeback"
                    ? "Contestação recebida em 12/09 pelo emissor"
                    : "Serviço cancelado pelo cliente"
                }
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

export function RefundsTable({
  rows,
  total,
  page,
  pageSize,
  canRefund,
  refundablePayments,
  mercadoPagoConfigured,
}: {
  rows: RefundRow[];
  total: number;
  page: number;
  pageSize: number;
  canRefund: boolean;
  refundablePayments: RefundablePayment[];
  mercadoPagoConfigured: boolean;
}) {
  const [modal, setModal] = React.useState<"refund" | "chargeback" | null>(null);

  return (
    <>
      {!mercadoPagoConfigured && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <RefreshCcw className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-amber-900">
            Mercado Pago não configurado: estornos de pagamentos do gateway ficam bloqueados até o
            token ser definido. Chargebacks continuam podendo ser registrados manualmente.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/gateways">Configurar gateway</Link>
          </Button>
        </div>
      )}

      <DataToolbar
        searchPlaceholder="Buscar por motivo ou ID do estorno..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "APPROVED", label: "Aprovado" },
              { value: "PENDING", label: "Processando" },
              { value: "REJECTED", label: "Recusado" },
              { value: "CHARGED_BACK", label: "Chargeback" },
            ],
          },
        ]}
        right={
          canRefund && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<AlertTriangle />}
                onClick={() => setModal("chargeback")}
              >
                Registrar chargeback
              </Button>
              <Button size="sm" icon={<Undo2 />} onClick={() => setModal("refund")}>
                Novo estorno
              </Button>
            </>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Data</TH>
              <TH>Cliente</TH>
              <TH>Projeto / cobrança</TH>
              <TH>Pagamento</TH>
              <TH align="right">Valor estornado</TH>
              <TH>Motivo</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={<Undo2 />}
                title="Nenhum estorno registrado"
                description="Estornos e chargebacks aparecem aqui com o valor devolvido, o motivo e o identificador no gateway."
                action={
                  canRefund && (
                    <Button size="sm" icon={<Undo2 />} onClick={() => setModal("refund")}>
                      Criar estorno
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((refund) => {
                const meta = refundStatusMeta(refund.status);
                const partial = Number(refund.amount) < Number(refund.payment_amount) - 0.01;

                return (
                  <TR key={refund.id}>
                    <TD className="tabular">{formatDateTime(refund.created_at)}</TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={refund.customer_name} size="xs" />
                        <span className="min-w-0 truncate">{refund.customer_name}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="block truncate">{refund.project_name}</span>
                      {refund.invoice_code && (
                        <span className="block font-mono text-[11px] text-ink-400">
                          {refund.invoice_code}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className="block text-ink-700">
                        {PAYMENT_METHOD[refund.payment_method].label}
                      </span>
                      <span className="block font-mono text-[11px] text-ink-400">
                        {refund.payment_provider_id ?? "—"}
                      </span>
                    </TD>
                    <TD align="right">
                      <span className="font-semibold tabular text-ink-900">
                        {formatCurrency(refund.amount)}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        de {formatCurrency(refund.payment_amount)}
                        {partial ? " · parcial" : ""}
                      </span>
                    </TD>
                    <TD className="max-w-[220px]">
                      <span className="block truncate text-ink-600" title={refund.reason ?? ""}>
                        {refund.reason ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge meta={meta} size="sm" />
                        {partial && (
                          <Badge tone="violet" size="sm">
                            parcial
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="iconXs" aria-label="Ações do estorno">
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          {refund.invoice_id && (
                            <MenuItem icon={<Receipt />} asChild>
                              <Link href={`/cobrancas/${refund.invoice_id}`}>Abrir cobrança</Link>
                            </MenuItem>
                          )}
                          <MenuItem icon={<ExternalLink />} asChild>
                            <Link href="/pagamentos">Ver transações</Link>
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </TableWrap>

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-400">
          <span>Identificador no gateway:</span>
          {rows
            .filter((refund) => refund.provider_refund_id)
            .slice(0, 4)
            .map((refund) => (
              <span key={refund.id} className="inline-flex items-center gap-1">
                <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-600">
                  {refund.provider_refund_id}
                </code>
                <CopyButton value={String(refund.provider_refund_id)} label="Copiar" />
              </span>
            ))}
        </div>
      )}

      {modal && (
        <NewRefundModal
          open
          onOpenChange={(open) => !open && setModal(null)}
          payments={refundablePayments}
          mode={modal}
        />
      )}
    </>
  );
}
