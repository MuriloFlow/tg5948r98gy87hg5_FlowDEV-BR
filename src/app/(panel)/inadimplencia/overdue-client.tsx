"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BanknoteArrowDown,
  CalendarClock,
  CheckCircle2,
  Link2,
  Lock,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar } from "@/components/panel/toolbar";
import {
  ManualPaymentModal,
  RescheduleModal,
  type InvoiceActionTarget,
} from "../cobrancas/invoices-table";
import {
  bulkBlockProjectsAction,
  bulkGenerateLinksAction,
  bulkSendRemindersAction,
} from "@/server/invoices";
import { INVOICE_STATUS, PROJECT_STATUS } from "@/lib/labels";
import { daysBetween, formatCurrency, formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvoiceFull } from "@/lib/types";

export type BucketKey = "1-7" | "8-15" | "16-30" | "30+";

export function bucketOf(daysOverdue: number): BucketKey {
  if (daysOverdue <= 7) return "1-7";
  if (daysOverdue <= 15) return "8-15";
  if (daysOverdue <= 30) return "16-30";
  return "30+";
}

const BUCKET_TONE: Record<BucketKey, "warning" | "danger" | "violet" | "neutral"> = {
  "1-7": "warning",
  "8-15": "warning",
  "16-30": "danger",
  "30+": "danger",
};

export function OverdueClient({
  rows,
  canWrite,
  canBlock,
  activeBucket,
}: {
  rows: InvoiceFull[];
  canWrite: boolean;
  canBlock: boolean;
  activeBucket?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [blockReason, setBlockReason] = React.useState(
    "Cobrança obrigatória vencida — acesso suspenso até a regularização"
  );
  const [dialog, setDialog] = React.useState<{
    kind: "manual" | "reschedule";
    invoice: InvoiceActionTarget;
  } | null>(null);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  function toggleAll() {
    setSelected(allSelected ? [] : rows.map((row) => row.id));
  }

  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const selectedAmount = selectedRows.reduce(
    (sum, row) => sum + (Number(row.total) - Number(row.paid_amount)),
    0
  );

  async function runBulk(kind: "reminder" | "link") {
    setBusy(true);
    const result =
      kind === "reminder"
        ? await bulkSendRemindersAction(selected)
        : await bulkGenerateLinksAction(selected);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      setSelected([]);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  async function confirmBlock() {
    setBusy(true);
    const projectIds = Array.from(new Set(selectedRows.map((row) => row.project_id)));
    const result = await bulkBlockProjectsAction(projectIds, blockReason);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Projetos bloqueados");
      setBlockOpen(false);
      setSelected([]);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível bloquear");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por cliente, projeto ou código..."
        filters={[
          {
            key: "faixa",
            label: "Faixa de atraso",
            options: [
              { value: "1-7", label: "1 a 7 dias" },
              { value: "8-15", label: "8 a 15 dias" },
              { value: "16-30", label: "16 a 30 dias" },
              { value: "30+", label: "Mais de 30 dias" },
            ],
            allLabel: "Todas as faixas",
          },
          {
            key: "bloqueio",
            label: "Situação do projeto",
            options: [
              { value: "bloqueados", label: "Projetos bloqueados" },
              { value: "liberados", label: "Ainda com acesso" },
            ],
            allLabel: "Qualquer situação",
          },
          {
            key: "obrigatoria",
            label: "Tipo de cobrança",
            options: [
              { value: "sim", label: "Obrigatórias (bloqueiam)" },
              { value: "nao", label: "Opcionais" },
            ],
            allLabel: "Todas",
          },
        ]}
      />

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3 animate-slide-up">
          <span className="text-[13px] font-medium text-ink-800">
            {selected.length} selecionada(s) ·{" "}
            <span className="tabular">{formatCurrency(selectedAmount)}</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canWrite && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Send />}
                  loading={busy}
                  onClick={() => void runBulk("reminder")}
                >
                  Reenviar cobrança
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Link2 />}
                  loading={busy}
                  onClick={() => void runBulk("link")}
                >
                  Gerar novo link
                </Button>
              </>
            )}
            {canBlock && (
              <Button
                variant="danger"
                size="sm"
                icon={<Lock />}
                onClick={() => setBlockOpen(true)}
              >
                Bloquear projeto
              </Button>
            )}
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Limpar seleção"
              onClick={() => setSelected([])}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Selecionar todas"
                  className="size-4 accent-brand-500"
                  disabled={rows.length === 0}
                />
              </TH>
              <TH>Cliente</TH>
              <TH>Cobrança</TH>
              <TH>Projeto</TH>
              <TH>Vencimento</TH>
              <TH align="right">Atraso</TH>
              <TH align="right">Em aberto</TH>
              <TH>Situação</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={9}
                icon={<CheckCircle2 />}
                title="Nenhuma cobrança em atraso"
                description={
                  activeBucket
                    ? "Nenhuma cobrança nesta faixa de atraso. Experimente limpar os filtros."
                    : "Sua carteira está em dia — nada vencido no momento."
                }
              />
            ) : (
              rows.map((invoice) => {
                const overdue = Math.max(Math.abs(daysBetween(invoice.due_date)), 0);
                const bucket = bucketOf(overdue);
                const balance = Number(invoice.total) - Number(invoice.paid_amount);
                const blocked = invoice.project_status === "BLOCKED_PAYMENT";
                const checked = selected.includes(invoice.id);

                return (
                  <TR key={invoice.id} className={cn(checked && "bg-brand-50/40")}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(invoice.id)}
                        aria-label={`Selecionar ${invoice.code}`}
                        className="size-4 accent-brand-500"
                      />
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={invoice.customer_name} size="xs" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900">
                            {invoice.customer_name}
                          </span>
                          <span className="block truncate text-[11.5px] text-ink-400">
                            {invoice.customer_email}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <Link
                        href={`/cobrancas/${invoice.id}`}
                        className="block truncate text-ink-800 hover:text-brand-600"
                      >
                        {invoice.description}
                      </Link>
                      <span className="block font-mono text-[11px] text-ink-400">
                        {invoice.code}
                        {invoice.reminder_count > 0
                          ? ` · ${invoice.reminder_count} reenvio(s)`
                          : ""}
                      </span>
                    </TD>
                    <TD className="max-w-[160px] truncate">{invoice.project_name}</TD>
                    <TD>
                      <span className="block tabular text-ink-800">
                        {formatDate(invoice.due_date)}
                      </span>
                      {invoice.last_reminder_at && (
                        <span className="block text-[11px] text-ink-400">
                          cobrado {formatRelative(invoice.last_reminder_at)}
                        </span>
                      )}
                    </TD>
                    <TD align="right">
                      <Badge tone={BUCKET_TONE[bucket]} size="sm">
                        {overdue} {overdue === 1 ? "dia" : "dias"}
                      </Badge>
                    </TD>
                    <TD align="right" className="font-semibold tabular text-ink-900">
                      {formatCurrency(balance)}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge meta={INVOICE_STATUS[invoice.status]} size="sm" />
                        <StatusBadge
                          meta={PROJECT_STATUS[invoice.project_status]}
                          size="sm"
                          dot={false}
                        />
                        {!invoice.is_mandatory && (
                          <Badge tone="neutral" size="sm">
                            opcional
                          </Badge>
                        )}
                      </div>
                      {!blocked && invoice.is_mandatory && invoice.blocks_at && (
                        <span className="mt-1 block text-[11px] text-amber-600">
                          bloqueia em {formatDate(invoice.blocks_at)}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label="Dar baixa manual"
                            title="Dar baixa manual"
                            onClick={() =>
                              setDialog({
                                kind: "manual",
                                invoice: {
                                  id: invoice.id,
                                  code: invoice.code,
                                  description: invoice.description,
                                  total: Number(invoice.total),
                                  paid_amount: Number(invoice.paid_amount),
                                  due_date: invoice.due_date,
                                  customer_name: invoice.customer_name,
                                },
                              })
                            }
                          >
                            <BanknoteArrowDown />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label="Alterar vencimento"
                            title="Alterar vencimento"
                            onClick={() =>
                              setDialog({
                                kind: "reschedule",
                                invoice: {
                                  id: invoice.id,
                                  code: invoice.code,
                                  description: invoice.description,
                                  total: Number(invoice.total),
                                  paid_amount: Number(invoice.paid_amount),
                                  due_date: invoice.due_date,
                                  customer_name: invoice.customer_name,
                                },
                              })
                            }
                          >
                            <CalendarClock />
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
        <p className="px-4 py-3 text-[12.5px] text-ink-400">
          {rows.length} cobrança(s) em atraso listada(s)
        </p>
      </TableWrap>

      <Modal
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title="Bloquear acesso dos projetos selecionados?"
        description="As aplicações integradas passam a receber o entitlement bloqueado imediatamente."
        size="sm"
        locked={busy}
        icon={<AlertTriangle />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmBlock()}>
              Bloquear {new Set(selectedRows.map((row) => row.project_id)).size} projeto(s)
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-2.5 text-[12.5px] text-ink-600">
            {Array.from(new Set(selectedRows.map((row) => row.project_name))).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <Field label="Motivo do bloqueio" htmlFor="block-reason">
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
            />
          </Field>
          <p className="rounded-lg bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800">
            O projeto é liberado automaticamente quando o pagamento é confirmado — não é preciso
            desbloquear manualmente.
          </p>
        </div>
      </Modal>

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
    </>
  );
}
