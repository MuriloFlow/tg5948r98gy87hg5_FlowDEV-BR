"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Receipt,
  Repeat,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { SubscriptionFormModal, monthlyValue } from "./subscription-form";
import {
  cancelSubscriptionAction,
  generateNowAction,
  pauseSubscriptionAction,
  resumeSubscriptionAction,
} from "@/server/subscriptions";
import { BILLING_INTERVAL, SUBSCRIPTION_STATUS } from "@/lib/labels";
import { daysBetween, formatCurrency, formatDate } from "@/lib/format";
import type { Subscription } from "@/lib/types";
import type { ProjectOption } from "../cobrancas/invoice-form";

export interface SubscriptionRow extends Subscription {
  project_name: string;
  project_code: string;
  customer_name: string;
}

function nextBillingLabel(subscription: SubscriptionRow): {
  text: string;
  tone: "muted" | "warning" | "danger";
} {
  if (subscription.status === "CANCELED") return { text: "encerrada", tone: "muted" };
  if (subscription.status === "PAUSED") return { text: "pausada", tone: "warning" };
  if (!subscription.next_billing_date) return { text: "sem agenda", tone: "muted" };

  const days = daysBetween(subscription.next_billing_date);
  if (days < 0) return { text: `atrasada ${Math.abs(days)} dia(s)`, tone: "danger" };
  if (days === 0) return { text: "gera hoje", tone: "warning" };
  if (days === 1) return { text: "amanhã", tone: "warning" };
  return { text: `em ${days} dias`, tone: days <= 5 ? "warning" : "muted" };
}

const TONE_CLASS = {
  muted: "text-ink-400",
  warning: "text-amber-600 font-medium",
  danger: "text-rose-600 font-medium",
} as const;

export function SubscriptionsTable({
  rows,
  total,
  page,
  pageSize,
  canWrite,
  projects,
  presetProjectId,
}: {
  rows: SubscriptionRow[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
  projects: ProjectOption[];
  presetProjectId?: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Subscription | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<SubscriptionRow | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(subscription: Subscription) {
    setEditing(subscription);
    setFormOpen(true);
  }

  async function togglePause(subscription: SubscriptionRow) {
    setBusy(true);
    const result =
      subscription.status === "PAUSED"
        ? await resumeSubscriptionAction(subscription.id)
        : await pauseSubscriptionAction(subscription.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Atualizado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível atualizar");
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    const result = await cancelSubscriptionAction(cancelTarget.id, cancelReason);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Recorrência cancelada");
      setCancelTarget(null);
      setCancelReason("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível cancelar");
    }
  }

  async function generateNow() {
    setGenerating(true);
    const result = await generateNowAction();
    setGenerating(false);

    if (result.ok) {
      toast.success(result.message ?? "Cobranças geradas");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível gerar as cobranças");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por nome da recorrência..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: Object.entries(SUBSCRIPTION_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            })),
          },
          {
            key: "intervalo",
            label: "Intervalo",
            options: Object.entries(BILLING_INTERVAL).map(([value, meta]) => ({
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
        ]}
        right={
          canWrite && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Zap />}
                loading={generating}
                onClick={() => void generateNow()}
              >
                Gerar cobranças agora
              </Button>
              <Button size="sm" onClick={openCreate} icon={<Plus />}>
                Nova recorrência
              </Button>
            </>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Recorrência</TH>
              <TH>Cliente / projeto</TH>
              <TH>Intervalo</TH>
              <TH>Próxima cobrança</TH>
              <TH align="right">Valor</TH>
              <TH align="right">MRR</TH>
              <TH align="center">Ciclos</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={9}
                icon={<Repeat />}
                title="Nenhuma recorrência configurada"
                description="Crie uma recorrência para faturar mensalidades automaticamente no dia fixo combinado."
                action={
                  canWrite && (
                    <Button size="sm" onClick={openCreate} icon={<Plus />}>
                      Criar recorrência
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((subscription) => {
                const next = nextBillingLabel(subscription);
                const mrr = monthlyValue(
                  Number(subscription.amount),
                  subscription.interval,
                  subscription.interval_count
                );

                return (
                  <TR key={subscription.id}>
                    <TD>
                      <span className="block truncate font-medium text-ink-900">
                        {subscription.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-400">
                        {subscription.description ?? "Sem descrição"}
                      </span>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={subscription.customer_name} size="xs" />
                        <span className="min-w-0">
                          <span className="block truncate">{subscription.customer_name}</span>
                          <span className="block truncate text-[11.5px] text-ink-400">
                            {subscription.project_name}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={BILLING_INTERVAL[subscription.interval].tone} size="sm">
                        {BILLING_INTERVAL[subscription.interval].label}
                      </Badge>
                      {subscription.interval_count > 1 && (
                        <span className="block text-[11px] text-ink-400">
                          a cada {subscription.interval_count} períodos
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className="block tabular text-ink-800">
                        {subscription.next_billing_date
                          ? formatDate(subscription.next_billing_date)
                          : "—"}
                      </span>
                      <span className={`block text-[11.5px] ${TONE_CLASS[next.tone]}`}>
                        {next.text}
                        {subscription.billing_day ? ` · todo dia ${subscription.billing_day}` : ""}
                      </span>
                    </TD>
                    <TD align="right" className="font-semibold tabular text-ink-900">
                      {formatCurrency(subscription.amount)}
                    </TD>
                    <TD align="right" className="tabular text-ink-700">
                      {mrr > 0 ? formatCurrency(mrr) : "—"}
                    </TD>
                    <TD align="center" className="tabular">
                      {subscription.cycles_billed}
                      {subscription.max_cycles ? `/${subscription.max_cycles}` : ""}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          meta={SUBSCRIPTION_STATUS[subscription.status]}
                          size="sm"
                        />
                        {!subscription.auto_charge && (
                          <Badge tone="neutral" size="sm" title="Não gera faturas sozinha">
                            manual
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="iconXs" aria-label="Ações da recorrência">
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={<Receipt />} asChild>
                            <Link href={`/cobrancas?projeto=${subscription.project_id}`}>
                              Ver cobranças do projeto
                            </Link>
                          </MenuItem>
                          {canWrite && (
                            <>
                              <MenuSeparator />
                              <MenuItem
                                icon={<Pencil />}
                                onSelect={() => openEdit(subscription)}
                              >
                                Editar recorrência
                              </MenuItem>
                              {subscription.status !== "CANCELED" && (
                                <MenuItem
                                  icon={
                                    subscription.status === "PAUSED" ? <Play /> : <Pause />
                                  }
                                  disabled={busy}
                                  onSelect={() => void togglePause(subscription)}
                                >
                                  {subscription.status === "PAUSED"
                                    ? "Retomar cobranças"
                                    : "Pausar cobranças"}
                                </MenuItem>
                              )}
                              <MenuItem
                                icon={<CalendarClock />}
                                disabled={generating}
                                onSelect={() => void generateNow()}
                              >
                                Gerar cobranças agora
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem
                                icon={<Ban />}
                                destructive
                                disabled={subscription.status === "CANCELED"}
                                onSelect={() => setCancelTarget(subscription)}
                              >
                                Cancelar recorrência
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
        <SubscriptionFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          subscription={editing}
          projects={projects}
          presetProjectId={presetProjectId}
        />
      )}

      <Modal
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={`Cancelar ${cancelTarget?.name ?? "recorrência"}?`}
        description="Nenhuma nova cobrança será gerada. As faturas já emitidas continuam válidas."
        size="sm"
        locked={busy}
        icon={<Ban />}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCancelTarget(null)}
              disabled={busy}
            >
              Manter ativa
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmCancel()}>
              Cancelar recorrência
            </Button>
          </>
        }
      >
        <Field label="Motivo" htmlFor="sub-cancel-reason" hint="Registrado na auditoria">
          <Textarea
            id="sub-cancel-reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Contrato encerrado a pedido do cliente"
          />
        </Field>
      </Modal>
    </>
  );
}
