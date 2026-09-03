"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Banknote,
  Coins,
  CreditCard,
  ExternalLink,
  FileText,
  HandCoins,
  Landmark,
  MoreHorizontal,
  QrCode,
  Receipt,
  RefreshCcw,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, CodeBlock, CopyButton } from "@/components/ui/misc";
import { Modal, SidePanel } from "@/components/ui/modal";
import { CurrencyInput, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { refundPaymentAction, syncPaymentAction } from "@/server/payments";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/labels";
import { formatCurrency, formatDateTime, formatDocument } from "@/lib/format";
import type { Payment, PaymentMethod } from "@/lib/types";
import type { ProjectOption } from "../cobrancas/invoice-form";

export interface PaymentRow extends Payment {
  provider_order_id: string | null;
  boleto_barcode: string | null;
  raw_payload: Record<string, unknown>;
  project_name: string;
  customer_name: string;
  invoice_code: string | null;
}

const METHOD_ICON: Record<PaymentMethod, React.ReactNode> = {
  PIX: <QrCode />,
  CREDIT_CARD: <CreditCard />,
  DEBIT_CARD: <CreditCard />,
  BOLETO: <FileText />,
  ACCOUNT_MONEY: <Wallet />,
  BANK_TRANSFER: <Landmark />,
  CASH: <Banknote />,
  MANUAL: <HandCoins />,
  OTHER: <Coins />,
};

function netOf(payment: PaymentRow): number {
  if (payment.net_amount != null) return Number(payment.net_amount);
  return Number(payment.amount) - Number(payment.fee_amount ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Estorno                                                                     */
/* -------------------------------------------------------------------------- */

export function RefundModal({
  open,
  onOpenChange,
  payment,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    refunded_amount: number;
    provider: string;
    provider_payment_id: string | null;
  };
  onDone?: () => void;
}) {
  const router = useRouter();
  const available = Math.max(Number(payment.amount) - Number(payment.refunded_amount ?? 0), 0);
  const [amount, setAmount] = React.useState(available);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const partial = amount > 0 && amount < available - 0.01;

  async function submit() {
    setBusy(true);
    const result = await refundPaymentAction({
      paymentId: payment.id,
      amount,
      reason,
    });
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Estorno registrado");
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível estornar");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Estornar pagamento"
      description="O valor é devolvido ao cliente pelo mesmo meio usado no pagamento."
      size="sm"
      locked={busy}
      icon={<Undo2 />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()} icon={<Undo2 />}>
            {partial ? "Estornar parcialmente" : "Estornar total"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink-400">Disponível</p>
            <p className="text-[15px] font-semibold tabular text-ink-900">
              {formatCurrency(available)}
            </p>
          </div>
          <p className="truncate font-mono text-[11.5px] text-ink-400">
            {payment.provider_payment_id ?? payment.provider}
          </p>
        </div>

        <Field
          label="Valor a estornar"
          htmlFor="refund-amount"
          hint="Estornos parciais são permitidos"
          required
        >
          <CurrencyInput id="refund-amount" value={amount} onValueChange={setAmount} />
        </Field>

        <Field label="Motivo" htmlFor="refund-reason" hint="Registrado na auditoria e no estorno">
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Serviço não executado / cobrança em duplicidade"
          />
        </Field>

        <p className="rounded-lg bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-800">
          Estornando o valor total, a cobrança vinculada é marcada como estornada e o projeto pode
          voltar a ser bloqueado na próxima verificação de inadimplência.
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabela                                                                      */
/* -------------------------------------------------------------------------- */

export function PaymentsTable({
  rows,
  total,
  page,
  pageSize,
  canRefund,
  canWrite,
  projects,
  mercadoPagoConfigured,
}: {
  rows: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  canRefund: boolean;
  canWrite: boolean;
  projects: ProjectOption[];
  mercadoPagoConfigured: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<PaymentRow | null>(null);
  const [refundTarget, setRefundTarget] = React.useState<PaymentRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function sync(payment: PaymentRow) {
    setBusyId(payment.id);
    const result = await syncPaymentAction(payment.id);
    setBusyId(null);
    if (result.ok) {
      toast.success(result.message ?? "Pagamento sincronizado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível sincronizar");
    }
  }

  const payloadPreview = React.useMemo(() => {
    if (!detail) return "";
    try {
      const json = JSON.stringify(detail.raw_payload ?? {}, null, 2);
      return json.length > 4000 ? `${json.slice(0, 4000)}\n… (truncado)` : json;
    } catch {
      return "{}";
    }
  }, [detail]);

  return (
    <>
      {!mercadoPagoConfigured && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <RefreshCcw className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-amber-900">
            Mercado Pago não configurado: sincronização e estorno pelo gateway ficam indisponíveis.
            As baixas manuais continuam funcionando normalmente.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/gateways">Configurar gateway</Link>
          </Button>
        </div>
      )}

      <DataToolbar
        searchPlaceholder="Buscar por ID do gateway, pagador ou e-mail..."
        filters={[
          {
            key: "metodo",
            label: "Método",
            options: Object.entries(PAYMENT_METHOD).map(([value, meta]) => ({
              value,
              label: meta.label,
            })),
          },
          {
            key: "status",
            label: "Status",
            options: Object.entries(PAYMENT_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            })),
          },
          {
            key: "periodo",
            label: "Período",
            options: [
              { value: "hoje", label: "Hoje" },
              { value: "7", label: "Últimos 7 dias" },
              { value: "30", label: "Últimos 30 dias" },
              { value: "90", label: "Últimos 90 dias" },
              { value: "mes", label: "Mês corrente" },
            ],
            allLabel: "Todo o período",
          },
          {
            key: "projeto",
            label: "Projeto",
            options: projects.map((project) => ({ value: project.id, label: project.name })),
            allLabel: "Todos os projetos",
          },
        ]}
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Data</TH>
              <TH>Cliente</TH>
              <TH>Projeto</TH>
              <TH>Método</TH>
              <TH align="right">Valor</TH>
              <TH align="right">Taxa</TH>
              <TH align="right">Líquido</TH>
              <TH>Status</TH>
              <TH>ID no gateway</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={10}
                icon={<CreditCard />}
                title="Nenhuma transação encontrada"
                description="Os pagamentos aparecem aqui automaticamente quando o gateway confirma o recebimento, e também ao registrar baixas manuais."
              />
            ) : (
              rows.map((payment) => (
                <TR key={payment.id} clickable onClick={() => setDetail(payment)}>
                  <TD>
                    <span className="block tabular text-ink-800">
                      {formatDateTime(payment.approved_at ?? payment.created_at)}
                    </span>
                    {payment.invoice_code && (
                      <span className="block font-mono text-[11px] text-ink-400">
                        {payment.invoice_code}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={payment.customer_name} size="xs" />
                      <span className="min-w-0 truncate">{payment.customer_name}</span>
                    </span>
                  </TD>
                  <TD className="max-w-[160px] truncate">{payment.project_name}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5 text-ink-700 [&_svg]:size-3.5 [&_svg]:text-ink-400">
                      {METHOD_ICON[payment.method]}
                      {PAYMENT_METHOD[payment.method].label}
                    </span>
                    {payment.installments > 1 && (
                      <span className="block text-[11px] text-ink-400">
                        {payment.installments}x
                      </span>
                    )}
                  </TD>
                  <TD align="right" className="font-semibold tabular text-ink-900">
                    {formatCurrency(payment.amount)}
                  </TD>
                  <TD align="right" className="tabular text-ink-500">
                    {Number(payment.fee_amount) > 0
                      ? `− ${formatCurrency(payment.fee_amount)}`
                      : "—"}
                  </TD>
                  <TD align="right" className="tabular text-ink-800">
                    {formatCurrency(netOf(payment))}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge meta={PAYMENT_STATUS[payment.status]} size="sm" />
                      {Number(payment.refunded_amount) > 0 && (
                        <Badge tone="violet" size="sm">
                          {formatCurrency(payment.refunded_amount)} estornado
                        </Badge>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <span className="font-mono text-[11.5px] text-ink-500">
                      {payment.provider_payment_id ?? "—"}
                    </span>
                  </TD>
                  <TD onClick={(event) => event.stopPropagation()}>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="iconXs"
                          aria-label="Ações do pagamento"
                          loading={busyId === payment.id}
                        >
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<ExternalLink />} onSelect={() => setDetail(payment)}>
                          Ver detalhes
                        </MenuItem>
                        {payment.invoice_id && (
                          <MenuItem icon={<Receipt />} asChild>
                            <Link href={`/cobrancas/${payment.invoice_id}`}>Abrir cobrança</Link>
                          </MenuItem>
                        )}
                        {canWrite && (
                          <MenuItem
                            icon={<RefreshCcw />}
                            disabled={!payment.provider_payment_id || payment.provider !== "mercadopago"}
                            onSelect={() => void sync(payment)}
                          >
                            Sincronizar com o gateway
                          </MenuItem>
                        )}
                        {canRefund && (
                          <>
                            <MenuSeparator />
                            <MenuItem
                              icon={<Undo2 />}
                              destructive
                              disabled={
                                payment.status !== "APPROVED" && payment.status !== "AUTHORIZED"
                              }
                              onSelect={() => setRefundTarget(payment)}
                            >
                              Estornar
                            </MenuItem>
                          </>
                        )}
                      </MenuContent>
                    </Menu>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </TableWrap>

      <SidePanel
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detail ? `Pagamento ${formatCurrency(detail.amount)}` : "Pagamento"}
        description={
          detail
            ? `${PAYMENT_METHOD[detail.method].label} · ${detail.customer_name}`
            : undefined
        }
        footer={
          detail && (
            <>
              {canWrite && (
                <Button
                  variant="secondary"
                  icon={<RefreshCcw />}
                  loading={busyId === detail.id}
                  disabled={!detail.provider_payment_id || detail.provider !== "mercadopago"}
                  onClick={() => void sync(detail)}
                >
                  Sincronizar
                </Button>
              )}
              {canRefund && (
                <Button
                  variant="danger"
                  icon={<Undo2 />}
                  disabled={detail.status !== "APPROVED" && detail.status !== "AUTHORIZED"}
                  onClick={() => setRefundTarget(detail)}
                >
                  Estornar
                </Button>
              )}
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge meta={PAYMENT_STATUS[detail.status]} />
              <Badge tone="neutral" size="sm">
                {detail.provider}
              </Badge>
              {detail.installments > 1 && (
                <Badge tone="info" size="sm">
                  {detail.installments}x
                </Badge>
              )}
            </div>

            <dl className="space-y-2.5 rounded-xl border border-ink-200 bg-ink-50/40 px-4 py-3.5 text-[12.5px]">
              {[
                ["Valor bruto", formatCurrency(detail.amount)],
                ["Taxa do gateway", formatCurrency(detail.fee_amount)],
                ["Valor líquido", formatCurrency(netOf(detail))],
                ["Estornado", formatCurrency(detail.refunded_amount)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="font-medium tabular text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>

            <dl className="space-y-2.5 text-[12.5px]">
              {[
                ["Projeto", detail.project_name],
                ["Cobrança", detail.invoice_code ?? "sem cobrança vinculada"],
                ["Criado em", formatDateTime(detail.created_at)],
                ["Aprovado em", detail.approved_at ? formatDateTime(detail.approved_at) : "—"],
                ["Status no gateway", detail.provider_status ?? "—"],
                ["Detalhe do status", detail.provider_status_detail ?? "—"],
                ["Pagador", detail.payer_name ?? "—"],
                ["E-mail do pagador", detail.payer_email ?? "—"],
                [
                  "Documento",
                  detail.payer_document ? formatDocument(detail.payer_document) : "—",
                ],
                [
                  "Cartão",
                  detail.card_brand
                    ? `${detail.card_brand}${detail.card_last4 ? ` ···· ${detail.card_last4}` : ""}`
                    : "—",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-ink-200/70 pb-2">
                  <dt className="shrink-0 text-ink-500">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-ink-800">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.provider_payment_id && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Identificadores
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-ink-100 px-2 py-1 font-mono text-[11.5px] text-ink-700">
                    {detail.provider_payment_id}
                  </code>
                  <CopyButton value={detail.provider_payment_id} label="Copiar ID" />
                </div>
                {detail.provider_order_id && (
                  <p className="font-mono text-[11px] text-ink-400">
                    order: {detail.provider_order_id}
                  </p>
                )}
              </div>
            )}

            {detail.boleto_url && (
              <Button variant="secondary" size="sm" block asChild>
                <a href={detail.boleto_url} target="_blank" rel="noopener noreferrer">
                  <FileText />
                  Abrir boleto
                </a>
              </Button>
            )}

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Payload do gateway
              </p>
              <CodeBlock code={payloadPreview || "{}"} language="json" />
            </div>

            <p className="rounded-lg bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800">
              Quando o pagamento é confirmado, a cobrança é quitada e o projeto é liberado
              automaticamente pelos gatilhos do banco.
            </p>
          </div>
        )}
      </SidePanel>

      {refundTarget && (
        <RefundModal
          open
          onOpenChange={(open) => !open && setRefundTarget(null)}
          payment={{
            id: refundTarget.id,
            amount: Number(refundTarget.amount),
            refunded_amount: Number(refundTarget.refunded_amount ?? 0),
            provider: refundTarget.provider,
            provider_payment_id: refundTarget.provider_payment_id,
          }}
          onDone={() => setDetail(null)}
        />
      )}
    </>
  );
}
