"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BanknoteArrowDown,
  CalendarClock,
  Copy,
  Ban,
  CopyPlus,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { CurrencyInput, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup } from "@/components/ui/field";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { InvoiceFormModal, type ProjectOption } from "./invoice-form";
import {
  cancelInvoiceAction,
  duplicateInvoiceAction,
  generatePaymentLinkAction,
  registerManualPaymentAction,
  rescheduleInvoiceAction,
  sendReminderAction,
} from "@/server/invoices";
import { INVOICE_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { daysBetween, formatCurrency, formatDate } from "@/lib/format";
import type { InvoiceFull, PaymentMethod } from "@/lib/types";

export interface CustomerOption {
  id: string;
  name: string;
}

export interface InvoiceActionTarget {
  id: string;
  code: string;
  description: string;
  total: number;
  paid_amount: number;
  due_date: string;
  customer_name?: string | null;
}

const MANUAL_METHODS: PaymentMethod[] = [
  "PIX",
  "BANK_TRANSFER",
  "CASH",
  "BOLETO",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "MANUAL",
  "OTHER",
];

/** "vence em 3 dias" / "5 dias em atraso" a partir da data de vencimento. */
export function dueLabel(dueDate: string, status: string) {
  if (status === "PAID") return { text: "quitada", tone: "muted" as const };
  if (status === "CANCELED") return { text: "cancelada", tone: "muted" as const };

  const days = daysBetween(dueDate);
  if (days < 0) {
    const overdue = Math.abs(days);
    return {
      text: `${overdue} ${overdue === 1 ? "dia" : "dias"} em atraso`,
      tone: "danger" as const,
    };
  }
  if (days === 0) return { text: "vence hoje", tone: "warning" as const };
  if (days === 1) return { text: "vence amanhã", tone: "warning" as const };
  return {
    text: `vence em ${days} dias`,
    tone: days <= 5 ? ("warning" as const) : ("muted" as const),
  };
}

const DUE_TONE_CLASS = {
  danger: "text-rose-600 font-medium",
  warning: "text-amber-600 font-medium",
  muted: "text-ink-400",
} as const;

/* -------------------------------------------------------------------------- */
/* Baixa manual                                                                */
/* -------------------------------------------------------------------------- */

export function ManualPaymentModal({
  open,
  onOpenChange,
  invoice,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceActionTarget;
  onDone?: () => void;
}) {
  const router = useRouter();
  const balance = Math.max(Number(invoice.total) - Number(invoice.paid_amount), 0);
  const [amount, setAmount] = React.useState(balance);
  const [method, setMethod] = React.useState<PaymentMethod>("PIX");
  const [paidAt, setPaidAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const result = await registerManualPaymentAction({
      invoiceId: invoice.id,
      amount,
      method,
      paidAt,
      note,
    });
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Baixa registrada");
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível registrar a baixa");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Dar baixa manual — ${invoice.code}`}
      description="Registre um pagamento recebido fora do gateway (Pix na conta, dinheiro, transferência)."
      size="md"
      locked={busy}
      icon={<BanknoteArrowDown />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={busy} icon={<BanknoteArrowDown />}>
            Registrar baixa
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink-900">{invoice.description}</p>
            <p className="text-[11.5px] text-ink-500">
              {invoice.customer_name ? `${invoice.customer_name} · ` : ""}
              vencimento {formatDate(invoice.due_date)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] uppercase tracking-wide text-ink-400">Saldo</p>
            <p className="text-[15px] font-semibold tabular text-ink-900">
              {formatCurrency(balance)}
            </p>
          </div>
        </div>

        <FieldGroup>
          <Field label="Valor recebido" htmlFor="manual-amount" required>
            <CurrencyInput id="manual-amount" value={amount} onValueChange={setAmount} />
          </Field>
          <Field label="Forma de recebimento" htmlFor="manual-method">
            <NativeSelect
              id="manual-method"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            >
              {MANUAL_METHODS.map((option) => (
                <option key={option} value={option}>
                  {PAYMENT_METHOD[option].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>

        <Field label="Data do recebimento" htmlFor="manual-date">
          <Input
            id="manual-date"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
          />
        </Field>

        <Field label="Observação" htmlFor="manual-note" hint="Fica registrada na auditoria">
          <Textarea
            id="manual-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Pix recebido na conta do Banco X às 14h"
          />
        </Field>

        <p className="rounded-lg bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800">
          Ao quitar a cobrança, o projeto é liberado automaticamente pelo próprio banco de dados —
          não é preciso desbloquear na mão.
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Alterar vencimento                                                          */
/* -------------------------------------------------------------------------- */

export function RescheduleModal({
  open,
  onOpenChange,
  invoice,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceActionTarget;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [dueDate, setDueDate] = React.useState(invoice.due_date);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const result = await rescheduleInvoiceAction(invoice.id, dueDate, reason);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Vencimento alterado");
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível alterar o vencimento");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Alterar vencimento — ${invoice.code}`}
      description="Cobranças vencidas voltam para “em aberto” e o projeto é reavaliado automaticamente."
      size="sm"
      locked={busy}
      icon={<CalendarClock />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Salvar vencimento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Novo vencimento" htmlFor="new-due-date" required>
          <Input
            id="new-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Field label="Motivo" htmlFor="reschedule-reason" hint="Registrado na auditoria">
          <Input
            id="reschedule-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Negociado com o cliente"
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Cancelar                                                                    */
/* -------------------------------------------------------------------------- */

export function CancelInvoiceModal({
  open,
  onOpenChange,
  invoice,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceActionTarget;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const result = await cancelInvoiceAction(invoice.id, reason);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Cobrança cancelada");
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível cancelar");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancelar ${invoice.code}?`}
      description="Os links de pagamento ativos são desativados e o cliente não consegue mais pagar."
      size="sm"
      locked={busy}
      icon={<Ban />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Manter cobrança
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={busy}>
            Cancelar cobrança
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-600">
          {invoice.description} — {formatCurrency(invoice.total)}
        </p>
        <Field label="Motivo do cancelamento" htmlFor="cancel-reason">
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Cobrança emitida em duplicidade"
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Reenvio de cobrança                                                         */
/* -------------------------------------------------------------------------- */

export function ReminderModal({
  open,
  onOpenChange,
  invoice,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceActionTarget;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [channel, setChannel] = React.useState<"email" | "whatsapp">("email");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const result = await sendReminderAction(invoice.id, channel);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Reenvio registrado");
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível registrar o reenvio");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Reenviar cobrança ${invoice.code}`}
      description="O envio automático de e-mail e WhatsApp ainda não está ativo nesta instalação."
      size="sm"
      locked={busy}
      icon={<Send />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Fechar
          </Button>
          <Button onClick={() => void submit()} loading={busy} icon={<Send />}>
            Registrar reenvio
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Canal" htmlFor="reminder-channel">
          <NativeSelect
            id="reminder-channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value as "email" | "whatsapp")}
          >
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option>
          </NativeSelect>
        </Field>
        <p className="rounded-lg bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-800">
          Esta ação <strong>registra a cobrança/reenvio</strong> no histórico da fatura, incrementa
          o contador de lembretes e notifica a equipe. Copie o link de pagamento para enviar ao
          cliente pelo canal escolhido.
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabela                                                                      */
/* -------------------------------------------------------------------------- */

type DialogKind = "manual" | "reschedule" | "cancel" | "reminder";

export function InvoicesTable({
  rows,
  total,
  page,
  pageSize,
  canWrite,
  projects,
  customers,
  appUrl,
  autoOpenNew,
  presetProjectId,
}: {
  rows: InvoiceFull[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
  projects: ProjectOption[];
  customers: CustomerOption[];
  appUrl: string;
  autoOpenNew?: boolean;
  presetProjectId?: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(Boolean(autoOpenNew));
  const [dialog, setDialog] = React.useState<{
    kind: DialogKind;
    invoice: InvoiceActionTarget;
  } | null>(null);
  const [linking, setLinking] = React.useState<string | null>(null);

  async function copyLink(invoice: InvoiceFull, forceNew = false) {
    if (invoice.payment_link_token && !forceNew) {
      await navigator.clipboard.writeText(`${appUrl}/pay/${invoice.payment_link_token}`);
      toast.success("Link de pagamento copiado");
      return;
    }

    setLinking(invoice.id);
    const result = await generatePaymentLinkAction(invoice.id, { forceNew });
    setLinking(null);

    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Não foi possível gerar o link");
      return;
    }

    try {
      await navigator.clipboard.writeText(`${appUrl}/pay/${result.data.token}`);
      toast.success(`${result.message ?? "Link gerado"} Copiado para a área de transferência.`);
    } catch {
      toast.success(result.message ?? "Link gerado");
    }
    router.refresh();
  }

  async function duplicate(invoice: InvoiceFull) {
    const result = await duplicateInvoiceAction(invoice.id);
    if (result.ok) {
      toast.success(result.message ?? "Cobrança duplicada");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível duplicar");
    }
  }

  function targetOf(invoice: InvoiceFull): InvoiceActionTarget {
    return {
      id: invoice.id,
      code: invoice.code,
      description: invoice.description,
      total: Number(invoice.total),
      paid_amount: Number(invoice.paid_amount),
      due_date: invoice.due_date,
      customer_name: invoice.customer_name,
    };
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por código, descrição ou referência..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: Object.entries(INVOICE_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            })),
          },
          {
            key: "projeto",
            label: "Projeto",
            options: projects.map((project) => ({ value: project.id, label: project.name })),
            allLabel: "Todos os projetos",
          },
          {
            key: "cliente",
            label: "Cliente",
            options: customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            })),
            allLabel: "Todos os clientes",
          },
          {
            key: "periodo",
            label: "Vencimento",
            options: [
              { value: "atrasadas", label: "Já vencidas" },
              { value: "hoje", label: "Vencem hoje" },
              { value: "7", label: "Próximos 7 dias" },
              { value: "15", label: "Próximos 15 dias" },
              { value: "30", label: "Próximos 30 dias" },
              { value: "mes", label: "Mês corrente" },
            ],
            allLabel: "Qualquer data",
          },
        ]}
        right={
          canWrite && (
            <Button size="sm" onClick={() => setFormOpen(true)} icon={<Plus />}>
              Nova cobrança
            </Button>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Cobrança</TH>
              <TH>Cliente</TH>
              <TH>Projeto</TH>
              <TH>Vencimento</TH>
              <TH align="right">Valor</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<Receipt />}
                title="Nenhuma cobrança encontrada"
                description="Ajuste os filtros ou emita a primeira cobrança para um dos seus projetos."
                action={
                  canWrite && (
                    <Button size="sm" onClick={() => setFormOpen(true)} icon={<Plus />}>
                      Emitir cobrança
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((invoice) => {
                const due = dueLabel(invoice.due_date, invoice.status);
                const balance = Number(invoice.total) - Number(invoice.paid_amount);

                return (
                  <TR key={invoice.id}>
                    <TD>
                      <Link href={`/cobrancas/${invoice.id}`} className="group block">
                        <span className="block truncate font-medium text-ink-900 group-hover:text-brand-600">
                          {invoice.description}
                        </span>
                        <span className="block font-mono text-[11.5px] text-ink-400">
                          {invoice.code}
                          {invoice.reference ? ` · ${invoice.reference}` : ""}
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={invoice.customer_name} size="xs" />
                        <span className="min-w-0 truncate">{invoice.customer_name}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="block truncate">{invoice.project_name}</span>
                      <span className="block font-mono text-[11px] text-ink-400">
                        {invoice.project_code}
                      </span>
                    </TD>
                    <TD>
                      <span className="block tabular text-ink-800">
                        {formatDate(invoice.due_date)}
                      </span>
                      <span className={`block text-[11.5px] ${DUE_TONE_CLASS[due.tone]}`}>
                        {due.text}
                      </span>
                    </TD>
                    <TD align="right">
                      <span className="font-semibold tabular text-ink-900">
                        {formatCurrency(invoice.total)}
                      </span>
                      {Number(invoice.paid_amount) > 0 && balance > 0 && (
                        <span className="block text-[11.5px] text-amber-600">
                          resta {formatCurrency(balance)}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge meta={INVOICE_STATUS[invoice.status]} size="sm" />
                        {!invoice.is_mandatory && (
                          <Badge tone="neutral" size="sm" title="Não bloqueia o projeto">
                            opcional
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label="Ações da cobrança"
                            loading={linking === invoice.id}
                          >
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={<ExternalLink />} asChild>
                            <Link href={`/cobrancas/${invoice.id}`}>Abrir cobrança</Link>
                          </MenuItem>
                          <MenuItem
                            icon={<Copy />}
                            onSelect={() => void copyLink(invoice)}
                          >
                            Copiar link de pagamento
                          </MenuItem>
                          {canWrite && (
                            <>
                              <MenuItem
                                icon={<Link2 />}
                                onSelect={() => void copyLink(invoice, true)}
                              >
                                Gerar novo link
                              </MenuItem>
                              <MenuSeparator />
                              <MenuLabel>Financeiro</MenuLabel>
                              <MenuItem
                                icon={<BanknoteArrowDown />}
                                disabled={
                                  invoice.status === "PAID" || invoice.status === "CANCELED"
                                }
                                onSelect={() =>
                                  setDialog({ kind: "manual", invoice: targetOf(invoice) })
                                }
                              >
                                Dar baixa manual
                              </MenuItem>
                              <MenuItem
                                icon={<CalendarClock />}
                                disabled={invoice.status === "PAID"}
                                onSelect={() =>
                                  setDialog({ kind: "reschedule", invoice: targetOf(invoice) })
                                }
                              >
                                Alterar vencimento
                              </MenuItem>
                              <MenuItem
                                icon={<Send />}
                                disabled={
                                  invoice.status === "PAID" || invoice.status === "CANCELED"
                                }
                                onSelect={() =>
                                  setDialog({ kind: "reminder", invoice: targetOf(invoice) })
                                }
                              >
                                Reenviar cobrança
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem
                                icon={<CopyPlus />}
                                onSelect={() => void duplicate(invoice)}
                              >
                                Duplicar
                              </MenuItem>
                              <MenuItem icon={<Pencil />} asChild>
                                <Link href={`/cobrancas/${invoice.id}`}>Editar no detalhe</Link>
                              </MenuItem>
                              <MenuItem
                                icon={<Ban />}
                                destructive
                                disabled={
                                  invoice.status === "PAID" || invoice.status === "CANCELED"
                                }
                                onSelect={() =>
                                  setDialog({ kind: "cancel", invoice: targetOf(invoice) })
                                }
                              >
                                Cancelar cobrança
                              </MenuItem>
                            </>
                          )}
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

      {formOpen && (
        <InvoiceFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          projects={projects}
          presetProjectId={presetProjectId}
        />
      )}

      {dialog?.kind === "manual" && (
        <ManualPaymentModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={dialog.invoice}
        />
      )}
      {dialog?.kind === "reschedule" && (
        <RescheduleModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={dialog.invoice}
        />
      )}
      {dialog?.kind === "cancel" && (
        <CancelInvoiceModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={dialog.invoice}
        />
      )}
      {dialog?.kind === "reminder" && (
        <ReminderModal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          invoice={dialog.invoice}
        />
      )}
    </>
  );
}
