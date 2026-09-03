"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  Eye,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Plus,
  Receipt,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, CopyButton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
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
import { LinkFormModal, type InvoiceOption } from "./link-form";
import {
  deleteLinkAction,
  disableLinkAction,
  extendExpirationAction,
  regenerateCheckoutAction,
} from "@/server/payment-links";
import { PAYMENT_LINK_STATUS } from "@/lib/labels";
import { formatCurrency, formatDate, formatRelative } from "@/lib/format";
import type { PaymentLink } from "@/lib/types";
import type { ProjectOption } from "../cobrancas/invoice-form";

export interface PaymentLinkRow extends PaymentLink {
  project_name: string;
  customer_name: string;
  invoice_code: string | null;
}

export function LinksTable({
  rows,
  total,
  page,
  pageSize,
  canWrite,
  projects,
  invoices,
  appUrl,
  mercadoPagoConfigured,
  presetProjectId,
}: {
  rows: PaymentLinkRow[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
  projects: ProjectOption[];
  invoices: InvoiceOption[];
  appUrl: string;
  mercadoPagoConfigured: boolean;
  presetProjectId?: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [extendTarget, setExtendTarget] = React.useState<PaymentLinkRow | null>(null);
  const [extendDays, setExtendDays] = React.useState("30");
  const [disableTarget, setDisableTarget] = React.useState<PaymentLinkRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PaymentLinkRow | null>(null);

  async function provision(link: PaymentLinkRow) {
    setBusyId(link.id);
    const result = await regenerateCheckoutAction(link.id);
    setBusyId(null);
    if (result.ok) {
      toast.success(result.message ?? "Checkout provisionado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível provisionar o checkout");
    }
  }

  async function confirmExtend() {
    if (!extendTarget) return;
    setBusyId(extendTarget.id);
    const result = await extendExpirationAction(extendTarget.id, Number(extendDays) || 30);
    setBusyId(null);
    if (result.ok) {
      toast.success(result.message ?? "Validade estendida");
      setExtendTarget(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível estender a validade");
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;
    setBusyId(disableTarget.id);
    const result = await disableLinkAction(disableTarget.id);
    setBusyId(null);
    if (result.ok) {
      toast.success(result.message ?? "Link desativado");
      setDisableTarget(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível desativar o link");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const result = await deleteLinkAction(deleteTarget.id);
    setBusyId(null);
    if (result.ok) {
      toast.success(result.message ?? "Link excluído");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível excluir o link");
    }
  }

  return (
    <>
      {!mercadoPagoConfigured && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Link2 className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-amber-900">
            Mercado Pago não configurado. Os links continuam sendo criados e a página pública
            mostra os dados da cobrança, mas o checkout só é provisionado depois de configurar o
            token de acesso.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/gateways">Configurar gateway</Link>
          </Button>
        </div>
      )}

      <DataToolbar
        searchPlaceholder="Buscar por título, token ou código da cobrança..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: Object.entries(PAYMENT_LINK_STATUS).map(([value, meta]) => ({
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
            key: "origem",
            label: "Origem",
            options: [
              { value: "cobranca", label: "Vinculado a cobrança" },
              { value: "avulso", label: "Link avulso" },
            ],
            allLabel: "Qualquer origem",
          },
        ]}
        right={
          canWrite && (
            <Button size="sm" onClick={() => setFormOpen(true)} icon={<Plus />}>
              Novo link
            </Button>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Link</TH>
              <TH>Cliente / projeto</TH>
              <TH>URL pública</TH>
              <TH align="right">Valor</TH>
              <TH align="center">Acessos</TH>
              <TH>Expira</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={<Link2 />}
                title="Nenhum payment link"
                description="Crie um link público para receber por Pix, cartão ou boleto sem que o cliente precise de login."
                action={
                  canWrite && (
                    <Button size="sm" onClick={() => setFormOpen(true)} icon={<Plus />}>
                      Criar link
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((link) => {
                const url = `${appUrl}/pay/${link.token}`;
                return (
                  <TR key={link.id}>
                    <TD>
                      <span className="block truncate font-medium text-ink-900">
                        {link.title}
                      </span>
                      <span className="block font-mono text-[11.5px] text-ink-400">
                        {link.short_code ?? link.token}
                        {link.invoice_code ? ` · ${link.invoice_code}` : " · avulso"}
                      </span>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={link.customer_name} size="xs" />
                        <span className="min-w-0">
                          <span className="block truncate">{link.customer_name}</span>
                          <span className="block truncate text-[11.5px] text-ink-400">
                            {link.project_name}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-1">
                        <code className="max-w-[190px] truncate rounded-md bg-ink-100 px-2 py-1 font-mono text-[11.5px] text-ink-700">
                          /pay/{link.token}
                        </code>
                        <CopyButton value={url} label="Copiar URL" />
                        <Button variant="ghost" size="iconXs" aria-label="Abrir link" asChild>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      </span>
                      {!link.checkout_url && (
                        <span className="mt-1 block text-[11px] text-amber-600">
                          checkout não provisionado
                        </span>
                      )}
                    </TD>
                    <TD align="right" className="font-semibold tabular text-ink-900">
                      {formatCurrency(link.amount)}
                    </TD>
                    <TD align="center">
                      <span className="inline-flex items-center gap-1 text-[12.5px] tabular text-ink-600">
                        <Eye className="size-3.5 text-ink-400" />
                        {link.view_count}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        {link.uses}/{link.max_uses} uso(s)
                      </span>
                    </TD>
                    <TD>
                      {link.expires_at ? (
                        <>
                          <span className="block tabular text-ink-800">
                            {formatDate(link.expires_at)}
                          </span>
                          <span className="block text-[11.5px] text-ink-400">
                            {formatRelative(link.expires_at)}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-300">sem prazo</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge meta={PAYMENT_LINK_STATUS[link.status]} size="sm" />
                        {link.checkout_url && (
                          <Badge tone="info" size="sm" title="Preferência criada no gateway">
                            checkout ok
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
                            aria-label="Ações do link"
                            loading={busyId === link.id}
                          >
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={<ExternalLink />} asChild>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              Abrir página de pagamento
                            </a>
                          </MenuItem>
                          {link.invoice_id && (
                            <MenuItem icon={<Receipt />} asChild>
                              <Link href={`/cobrancas/${link.invoice_id}`}>Ver cobrança</Link>
                            </MenuItem>
                          )}
                          {link.checkout_url && (
                            <MenuItem icon={<Link2 />} asChild>
                              <a
                                href={link.checkout_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Abrir checkout do gateway
                              </a>
                            </MenuItem>
                          )}
                          {canWrite && (
                            <>
                              <MenuSeparator />
                              <MenuItem
                                icon={<RefreshCcw />}
                                disabled={link.status !== "ACTIVE"}
                                onSelect={() => void provision(link)}
                              >
                                {link.checkout_url
                                  ? "Recriar checkout"
                                  : "Provisionar checkout"}
                              </MenuItem>
                              <MenuItem
                                icon={<CalendarClock />}
                                onSelect={() => {
                                  setExtendDays("30");
                                  setExtendTarget(link);
                                }}
                              >
                                Estender validade
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem
                                icon={<Ban />}
                                destructive
                                disabled={link.status !== "ACTIVE"}
                                onSelect={() => setDisableTarget(link)}
                              >
                                Desativar link
                              </MenuItem>
                              <MenuItem
                                icon={<Trash2 />}
                                destructive
                                disabled={link.status === "PAID"}
                                onSelect={() => setDeleteTarget(link)}
                              >
                                Excluir link
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
        <LinkFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          projects={projects}
          invoices={invoices}
          presetProjectId={presetProjectId}
        />
      )}

      <Modal
        open={Boolean(extendTarget)}
        onOpenChange={(open) => !open && setExtendTarget(null)}
        title="Estender validade do link"
        description="A contagem começa a partir da validade atual, ou de hoje se o link já expirou."
        size="sm"
        locked={busyId === extendTarget?.id}
        icon={<CalendarClock />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtendTarget(null)}>
              Cancelar
            </Button>
            <Button
              loading={busyId === extendTarget?.id}
              onClick={() => void confirmExtend()}
            >
              Estender
            </Button>
          </>
        }
      >
        <Field label="Dias adicionais" htmlFor="extend-days" required>
          <Input
            id="extend-days"
            type="number"
            min={1}
            max={365}
            value={extendDays}
            onChange={(event) => setExtendDays(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(disableTarget)}
        onOpenChange={(open) => !open && setDisableTarget(null)}
        title={`Desativar “${disableTarget?.title ?? "link"}”?`}
        description="A página pública deixa de aceitar pagamentos. Você pode gerar um novo link depois."
        size="sm"
        locked={busyId === disableTarget?.id}
        icon={<Ban />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisableTarget(null)}>
              Manter ativo
            </Button>
            <Button
              variant="danger"
              loading={busyId === disableTarget?.id}
              onClick={() => void confirmDisable()}
            >
              Desativar link
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-600">
          {disableTarget ? formatCurrency(disableTarget.amount) : ""} ·{" "}
          {disableTarget?.customer_name}
        </p>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Excluir “${deleteTarget?.title ?? "link"}”?`}
        description="A URL pública deixa de existir e o registro sai do painel. Esta ação não pode ser desfeita."
        size="sm"
        locked={busyId === deleteTarget?.id}
        icon={<Trash2 />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={busyId === deleteTarget?.id}
              onClick={() => void confirmDelete()}
            >
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-600">
          {deleteTarget ? formatCurrency(deleteTarget.amount) : ""} ·{" "}
          {deleteTarget?.customer_name}
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
          Se quiser apenas parar de receber por este link mantendo o histórico, use{" "}
          <strong className="font-semibold">Desativar link</strong>. Links com pagamentos
          registrados não podem ser excluídos.
        </p>
      </Modal>
    </>
  );
}
