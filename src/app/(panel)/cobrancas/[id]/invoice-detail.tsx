"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BanknoteArrowDown,
  Ban,
  CalendarClock,
  CopyPlus,
  CreditCard,
  ExternalLink,
  Link2,
  Lock,
  Pencil,
  Printer,
  Receipt,
  Send,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  CancelInvoiceModal,
  ManualPaymentModal,
  RescheduleModal,
  ReminderModal,
  dueLabel,
  type InvoiceActionTarget,
} from "../invoices-table";
import { InvoiceFormModal, type ProjectOption } from "../invoice-form";
import { duplicateInvoiceAction, generatePaymentLinkAction } from "@/server/invoices";
import {
  INVOICE_STATUS,
  PAYMENT_LINK_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PROJECT_STATUS,
} from "@/lib/labels";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDocument,
  formatRelative,
} from "@/lib/format";
import type {
  ActivityEntry,
  InvoiceFull,
  InvoiceItem,
  Payment,
  PaymentLink,
} from "@/lib/types";

export interface InvoiceCustomer {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string;
  phone: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
}

type DialogKind = "manual" | "reschedule" | "cancel" | "reminder" | "edit";

export function InvoiceDetail({
  invoice,
  items,
  activity,
  payments,
  links,
  customer,
  projects,
  appUrl,
  canWrite,
  mercadoPagoConfigured,
}: {
  invoice: InvoiceFull;
  items: InvoiceItem[];
  activity: ActivityEntry[];
  payments: Payment[];
  links: PaymentLink[];
  customer: InvoiceCustomer | null;
  projects: ProjectOption[];
  appUrl: string;
  canWrite: boolean;
  mercadoPagoConfigured: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogKind | null>(null);
  const [busy, setBusy] = React.useState(false);

  const target: InvoiceActionTarget = {
    id: invoice.id,
    code: invoice.code,
    description: invoice.description,
    total: Number(invoice.total),
    paid_amount: Number(invoice.paid_amount),
    due_date: invoice.due_date,
    customer_name: invoice.customer_name,
  };

  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const due = dueLabel(invoice.due_date, invoice.status);
  const activeLink = links.find((link) => link.status === "ACTIVE") ?? null;
  const publicUrl = activeLink ? `${appUrl}/pay/${activeLink.token}` : null;
  const settled = invoice.status === "PAID" || invoice.status === "CANCELED";

  async function handleLink(forceNew: boolean) {
    setBusy(true);
    const result = await generatePaymentLinkAction(invoice.id, { forceNew });
    setBusy(false);

    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Não foi possível gerar o link");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${appUrl}/pay/${result.data.token}`);
      toast.success(`${result.message ?? "Link pronto"} Copiado.`);
    } catch {
      toast.success(result.message ?? "Link pronto");
    }
    router.refresh();
  }

  async function handleDuplicate() {
    setBusy(true);
    const result = await duplicateInvoiceAction(invoice.id);
    setBusy(false);
    if (result.ok && result.data) {
      toast.success(result.message ?? "Cobrança duplicada");
      router.push(`/cobrancas/${result.data.id}`);
    } else {
      toast.error(result.error ?? "Não foi possível duplicar");
    }
  }

  const displayItems: InvoiceItem[] = items.length
    ? items
    : [
        {
          id: "single",
          invoice_id: invoice.id,
          description: invoice.description,
          quantity: 1,
          unit_amount: Number(invoice.subtotal),
          total: Number(invoice.subtotal),
          position: 0,
        },
      ];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* ------------------------------------------------ fatura imprimível */}
        <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card)] print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200/70 px-6 py-5">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                FlowDesk
              </p>
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-ink-900">
                Cobrança {invoice.code}
              </h2>
              <p className="text-[12.5px] text-ink-500">
                Emitida em {formatDate(invoice.issued_at)} · vencimento{" "}
                {formatDate(invoice.due_date)}
              </p>
            </div>
            <div className="space-y-1.5 text-right">
              <StatusBadge meta={INVOICE_STATUS[invoice.status]} />
              <p className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular text-ink-900">
                {formatCurrency(invoice.total)}
              </p>
              {balance > 0 && invoice.status !== "CANCELED" && (
                <p className="text-[12px] text-ink-500">
                  Saldo em aberto{" "}
                  <span className="font-medium tabular">{formatCurrency(balance)}</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6 border-b border-ink-200/70 px-6 py-5 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Cliente
              </p>
              <p className="text-[13.5px] font-medium text-ink-900">
                {customer?.legal_name || invoice.customer_name}
              </p>
              <p className="text-[12.5px] text-ink-500">{invoice.customer_email}</p>
              {customer?.document && (
                <p className="text-[12.5px] tabular text-ink-500">
                  {formatDocument(customer.document)}
                </p>
              )}
              {customer?.street && (
                <p className="text-[12.5px] leading-relaxed text-ink-500">
                  {customer.street}
                  {customer.number ? `, ${customer.number}` : ""}
                  {customer.complement ? ` — ${customer.complement}` : ""}
                  <br />
                  {[customer.district, customer.city, customer.state]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="space-y-1 sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Projeto
              </p>
              <p className="text-[13.5px] font-medium text-ink-900">{invoice.project_name}</p>
              <p className="font-mono text-[12px] text-ink-500">{invoice.project_code}</p>
              <div className="sm:flex sm:justify-end">
                <StatusBadge
                  meta={PROJECT_STATUS[invoice.project_status]}
                  size="sm"
                  dot={false}
                />
              </div>
              {invoice.reference && (
                <p className="text-[12.5px] text-ink-500">Ref.: {invoice.reference}</p>
              )}
            </div>
          </div>

          <Table>
            <THead>
              <tr>
                <TH>Descrição</TH>
                <TH align="center">Qtd</TH>
                <TH align="right">Valor unitário</TH>
                <TH align="right">Total</TH>
              </tr>
            </THead>
            <TBody>
              {displayItems.map((item) => (
                <TR key={item.id}>
                  <TD className="text-ink-800">{item.description}</TD>
                  <TD align="center" className="tabular">
                    {Number(item.quantity)}
                  </TD>
                  <TD align="right" className="tabular">
                    {formatCurrency(item.unit_amount)}
                  </TD>
                  <TD align="right" className="font-medium tabular text-ink-900">
                    {formatCurrency(Number(item.quantity) * Number(item.unit_amount))}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="flex justify-end border-t border-ink-200/70 px-6 py-5">
            <dl className="w-full max-w-xs space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="tabular text-ink-800">{formatCurrency(invoice.subtotal)}</dd>
              </div>
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Desconto</dt>
                  <dd className="tabular text-emerald-600">
                    − {formatCurrency(invoice.discount_amount)}
                  </dd>
                </div>
              )}
              {Number(invoice.late_fee_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Multa</dt>
                  <dd className="tabular text-rose-600">
                    + {formatCurrency(invoice.late_fee_amount)}
                  </dd>
                </div>
              )}
              {Number(invoice.interest_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Juros</dt>
                  <dd className="tabular text-rose-600">
                    + {formatCurrency(invoice.interest_amount)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-200 pt-2">
                <dt className="font-semibold text-ink-900">Total</dt>
                <dd className="text-[15px] font-semibold tabular text-ink-900">
                  {formatCurrency(invoice.total)}
                </dd>
              </div>
              {Number(invoice.paid_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Pago</dt>
                  <dd className="tabular text-emerald-600">
                    {formatCurrency(invoice.paid_amount)}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {(invoice.notes || publicUrl) && (
            <div className="space-y-2 border-t border-ink-200/70 bg-ink-50/40 px-6 py-4">
              {invoice.notes && (
                <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink-600">
                  {invoice.notes}
                </p>
              )}
              {publicUrl && (
                <p className="text-[12.5px] text-ink-500">
                  Pague online em{" "}
                  <span className="font-mono text-ink-800">{publicUrl}</span>
                </p>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------ pagamentos */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Pagamentos</CardTitle>
            <Badge tone={payments.length ? "info" : "neutral"} size="sm">
              {payments.length}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState
                  icon={<CreditCard />}
                  title="Nenhuma tentativa de pagamento"
                  description="Gere um link de pagamento ou registre uma baixa manual."
                  className="border-0 bg-transparent py-0"
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-200/70">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                      <CreditCard className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-900">
                        {PAYMENT_METHOD[payment.method].label}
                        {payment.installments > 1 ? ` · ${payment.installments}x` : ""}
                      </p>
                      <p className="truncate font-mono text-[11.5px] text-ink-400">
                        {payment.provider_payment_id ?? payment.provider}
                        {" · "}
                        {formatDateTime(payment.approved_at ?? payment.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold tabular text-ink-900">
                        {formatCurrency(payment.amount)}
                      </p>
                      {Number(payment.refunded_amount) > 0 && (
                        <p className="text-[11px] text-violet-600">
                          {formatCurrency(payment.refunded_amount)} estornado
                        </p>
                      )}
                    </div>
                    <StatusBadge meta={PAYMENT_STATUS[payment.status]} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- payment links */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Links de pagamento</CardTitle>
            {canWrite && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Link2 />}
                loading={busy}
                onClick={() => void handleLink(true)}
              >
                Gerar novo link
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {links.length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState
                  icon={<Link2 />}
                  title="Sem links gerados"
                  description="O link público permite pagamento por Pix, cartão ou boleto sem login."
                  action={
                    canWrite && (
                      <Button size="sm" loading={busy} onClick={() => void handleLink(false)}>
                        Gerar link
                      </Button>
                    )
                  }
                  className="border-0 bg-transparent py-0"
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-200/70">
                {links.map((link) => {
                  const url = `${appUrl}/pay/${link.token}`;
                  return (
                    <li key={link.id} className="space-y-2 px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge meta={PAYMENT_LINK_STATUS[link.status]} size="sm" />
                        <span className="text-[12.5px] font-medium tabular text-ink-800">
                          {formatCurrency(link.amount)}
                        </span>
                        <span className="text-[11.5px] text-ink-400">
                          {link.view_count} visualizaç{link.view_count === 1 ? "ão" : "ões"} ·{" "}
                          {link.uses}/{link.max_uses} uso(s)
                        </span>
                        {link.expires_at && (
                          <span className="text-[11.5px] text-ink-400">
                            expira {formatRelative(link.expires_at)}
                          </span>
                        )}
                        {!link.checkout_url && (
                          <Badge tone="warning" size="sm">
                            checkout não provisionado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-ink-100 px-2 py-1 font-mono text-[11.5px] text-ink-700">
                          {url}
                        </code>
                        <CopyButton value={url} label="Copiar link" size="iconSm" />
                        <Button variant="ghost" size="iconSm" aria-label="Abrir link" asChild>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- timeline */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Histórico da cobrança</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-400">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              <ol className="space-y-0">
                {activity.map((entry, index) => (
                  <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < activity.length - 1 && (
                      <span
                        className="absolute left-[13px] top-7 h-full w-px bg-ink-200"
                        aria-hidden
                      />
                    )}
                    <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                      {entry.kind === "payment" ? (
                        <CreditCard className="size-3.5" />
                      ) : entry.kind === "email" ? (
                        <Send className="size-3.5" />
                      ) : entry.kind === "status_changed" ? (
                        <CalendarClock className="size-3.5" />
                      ) : (
                        <Receipt className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[13px] font-medium leading-snug text-ink-800">
                        {entry.title}
                      </p>
                      {entry.description && (
                        <p className="text-[12px] leading-relaxed text-ink-500">
                          {entry.description}
                        </p>
                      )}
                      <p className="text-[11px] text-ink-400">
                        {formatDateTime(entry.created_at)}
                        {entry.actor_label ? ` · ${entry.actor_label}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------ sidebar */}
      <aside className="no-print space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {publicUrl ? (
              <>
                <Button
                  variant="secondary"
                  block
                  icon={<Link2 />}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(publicUrl)
                      .then(() => toast.success("Link copiado"))
                      .catch(() => toast.error("Não foi possível copiar"));
                  }}
                >
                  Copiar link de pagamento
                </Button>
                <Button variant="ghost" block icon={<ExternalLink />} asChild>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    Abrir página de pagamento
                  </a>
                </Button>
              </>
            ) : (
              canWrite && (
                <Button block icon={<Link2 />} loading={busy} onClick={() => void handleLink(false)}>
                  Gerar link de pagamento
                </Button>
              )
            )}

            {canWrite && (
              <>
                <Button
                  variant="secondary"
                  block
                  icon={<BanknoteArrowDown />}
                  disabled={settled}
                  onClick={() => setDialog("manual")}
                >
                  Dar baixa manual
                </Button>
                <Button
                  variant="secondary"
                  block
                  icon={<CalendarClock />}
                  disabled={invoice.status === "PAID"}
                  onClick={() => setDialog("reschedule")}
                >
                  Alterar vencimento
                </Button>
                <Button
                  variant="secondary"
                  block
                  icon={<Send />}
                  disabled={settled}
                  onClick={() => setDialog("reminder")}
                >
                  Reenviar cobrança
                </Button>
                <Button
                  variant="secondary"
                  block
                  icon={<Pencil />}
                  disabled={invoice.status === "PAID" || invoice.status === "REFUNDED"}
                  onClick={() => setDialog("edit")}
                >
                  Editar cobrança
                </Button>
                <Button
                  variant="secondary"
                  block
                  icon={<CopyPlus />}
                  loading={busy}
                  onClick={() => void handleDuplicate()}
                >
                  Duplicar cobrança
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              block
              icon={<Printer />}
              onClick={() => window.print()}
            >
              Imprimir / salvar PDF
            </Button>

            {canWrite && !settled && (
              <Button
                variant="dangerGhost"
                block
                icon={<Ban />}
                onClick={() => setDialog("cancel")}
              >
                Cancelar cobrança
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Situação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[12.5px]">
            <div className="flex items-start gap-2.5">
              <span
                className={
                  invoice.is_mandatory
                    ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600"
                    : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500"
                }
              >
                {invoice.is_mandatory ? (
                  <Lock className="size-3.5" />
                ) : (
                  <Unlock className="size-3.5" />
                )}
              </span>
              <p className="leading-relaxed text-ink-600">
                {invoice.is_mandatory
                  ? "Cobrança obrigatória: se vencer, o projeto é bloqueado automaticamente após a carência."
                  : "Cobrança opcional: o vencimento não bloqueia o acesso do projeto."}
              </p>
            </div>

            <dl className="space-y-2 border-t border-ink-200 pt-3">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Vencimento</dt>
                <dd className="text-right text-ink-800">
                  {formatDate(invoice.due_date)}
                  <span className="block text-[11px] text-ink-400">{due.text}</span>
                </dd>
              </div>
              {invoice.blocks_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-500">Bloqueia em</dt>
                  <dd className="text-ink-800">{formatDate(invoice.blocks_at)}</dd>
                </div>
              )}
              {invoice.expires_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-500">Expira em</dt>
                  <dd className="text-ink-800">{formatDate(invoice.expires_at)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Reenvios</dt>
                <dd className="text-ink-800">
                  {invoice.reminder_count}
                  {invoice.last_reminder_at && (
                    <span className="block text-[11px] text-ink-400">
                      último {formatRelative(invoice.last_reminder_at)}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Parcelamento</dt>
                <dd className="text-ink-800">
                  {invoice.allow_installments ? `até ${invoice.max_installments}x` : "à vista"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-1.5 border-t border-ink-200 pt-3">
              {invoice.payment_methods.map((method) => (
                <Badge key={method} tone="neutral" size="sm">
                  {PAYMENT_METHOD[method].label}
                </Badge>
              ))}
            </div>

            <p className="rounded-lg bg-emerald-50 px-3 py-2.5 leading-relaxed text-emerald-800">
              O projeto é liberado automaticamente quando o pagamento é confirmado.
            </p>

            {!mercadoPagoConfigured && (
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 leading-relaxed text-amber-800">
                Mercado Pago não configurado: os links são criados sem checkout. Configure o token
                em{" "}
                <Link href="/gateways" className="font-medium underline">
                  Gateways
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>

        {invoice.internal_notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notas internas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink-600">
                {invoice.internal_notes}
              </p>
            </CardContent>
          </Card>
        )}
      </aside>

      {dialog === "manual" && (
        <ManualPaymentModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={target}
        />
      )}
      {dialog === "reschedule" && (
        <RescheduleModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={target}
        />
      )}
      {dialog === "cancel" && (
        <CancelInvoiceModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={target}
        />
      )}
      {dialog === "reminder" && (
        <ReminderModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={target}
        />
      )}
      {dialog === "edit" && (
        <InvoiceFormModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={invoice}
          items={items}
          projects={projects}
        />
      )}
    </div>
  );
}
