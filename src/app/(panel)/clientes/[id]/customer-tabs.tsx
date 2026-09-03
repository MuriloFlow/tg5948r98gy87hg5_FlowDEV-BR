"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArrowUpRight,
  Blocks,
  Building2,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  RotateCcw,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CustomerFormModal } from "../customer-form";
import { archiveCustomerAction, deleteCustomerAction, restoreCustomerAction } from "@/server/customers";
import {
  ENTITY_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  invoiceStatusMeta,
  projectStatusMeta,
} from "@/lib/labels";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDocument,
  formatPhone,
  formatRelative,
  formatZip,
} from "@/lib/format";
import type {
  ActivityEntry,
  Company,
  Customer,
  InvoiceFull,
  Payment,
  Project,
} from "@/lib/types";

export interface CustomerContact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  receives_billing: boolean;
}

export interface CustomerDetailData {
  companies: Company[];
  contacts: CustomerContact[];
  projects: Project[];
  invoices: InvoiceFull[];
  payments: Payment[];
  activity: ActivityEntry[];
}

/* ------------------------------------------------------- ações do header -- */

export function CustomerHeaderActions({
  customer,
  canWrite,
}: {
  customer: Customer;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const archived = customer.status === "ARCHIVED";

  async function toggleArchive() {
    setBusy(true);
    const result = archived
      ? await restoreCustomerAction(customer.id)
      : await archiveCustomerAction(customer.id);
    setBusy(false);

    if (result.ok) {
      setConfirmArchive(false);
      toast.success(archived ? "Cliente reativado" : "Cliente arquivado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  async function removeCustomer() {
    setBusy(true);
    const result = await deleteCustomerAction(customer.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Cliente excluído");
      router.push("/clientes");
    } else {
      toast.error(result.error ?? "Não foi possível excluir");
    }
  }

  if (!canWrite) return null;

  return (
    <>
      <Button variant="secondary" icon={<Pencil />} onClick={() => setEditing(true)}>
        Editar
      </Button>
      <Button
        variant={archived ? "secondary" : "ghost"}
        icon={archived ? <RotateCcw /> : <Archive />}
        onClick={() => setConfirmArchive(true)}
      >
        {archived ? "Reativar" : "Arquivar"}
      </Button>
      <Button
        variant="ghost"
        icon={<Trash2 />}
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={() => setConfirmDelete(true)}
      >
        Excluir
      </Button>

      <CustomerFormModal open={editing} onOpenChange={setEditing} customer={customer} />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={archived ? "Reativar cliente?" : "Arquivar cliente?"}
        description={
          archived
            ? "O cliente volta a aparecer nas listagens e pode receber novas cobranças."
            : "O cliente sai das listagens padrão. As cobranças existentes continuam válidas e nada é apagado."
        }
        confirmLabel={archived ? "Reativar" : "Arquivar"}
        destructive={!archived}
        loading={busy}
        onConfirm={toggleArchive}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir ${customer.name}?`}
        description="A exclusão é permanente e só é permitida para clientes sem cobranças ou pagamentos confirmados. Projetos vinculados sem histórico financeiro também serão removidos."
        confirmLabel="Excluir definitivamente"
        destructive
        loading={busy}
        onConfirm={removeCustomer}
      />
    </>
  );
}

/* ------------------------------------------------------------------ abas -- */

export function CustomerTabs({
  customer,
  data,
}: {
  customer: Customer;
  data: CustomerDetailData;
}) {
  const openInvoices = data.invoices.filter((invoice) =>
    ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"].includes(invoice.status)
  );

  return (
    <Tabs defaultValue="visao-geral">
      <TabsList>
        <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
        <TabsTrigger value="projetos">Projetos ({data.projects.length})</TabsTrigger>
        <TabsTrigger value="cobrancas">Cobranças ({data.invoices.length})</TabsTrigger>
        <TabsTrigger value="pagamentos">Pagamentos ({data.payments.length})</TabsTrigger>
        <TabsTrigger value="contatos">Contatos ({data.contacts.length})</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------------ visão geral */}
      <TabsContent value="visao-geral">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Dados cadastrais</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-ink-200/70">
              <DataRow label="Tipo" value={customer.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} />
              {customer.legal_name && <DataRow label="Razão social" value={customer.legal_name} />}
              {customer.document && (
                <DataRow label={customer.type === "PJ" ? "CNPJ" : "CPF"} value={formatDocument(customer.document)} />
              )}
              <DataRow
                label="E-mail"
                value={
                  <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center gap-1.5 text-brand-600 hover:underline"
                  >
                    <Mail className="size-3.5" />
                    {customer.email}
                  </a>
                }
              />
              {customer.phone && (
                <DataRow
                  label="Telefone"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-ink-400" />
                      {formatPhone(customer.phone)}
                    </span>
                  }
                />
              )}
              {customer.whatsapp && (
                <DataRow
                  label="WhatsApp"
                  value={
                    <a
                      href={`https://wa.me/55${customer.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                    >
                      {formatPhone(customer.whatsapp)}
                      <ExternalLink className="size-3" />
                    </a>
                  }
                />
              )}
              {customer.website && (
                <DataRow
                  label="Site"
                  value={
                    <a
                      href={customer.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                    >
                      {customer.website.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3" />
                    </a>
                  }
                />
              )}
              <DataRow label="Cadastrado em" value={formatDate(customer.created_at)} />
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Preferências de cobrança</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-ink-200/70">
                <DataRow
                  label="Dia de vencimento"
                  value={
                    customer.default_due_day ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-3.5 text-ink-400" />
                        Todo dia {customer.default_due_day}
                      </span>
                    ) : (
                      <span className="text-ink-400">Definido por cobrança</span>
                    )
                  }
                />
                <DataRow
                  label="Formas de pagamento"
                  value={
                    customer.default_payment_methods.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {customer.default_payment_methods.map((method) => (
                          <Badge key={method} tone="neutral" size="sm">
                            {PAYMENT_METHOD[method]?.label ?? method}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-ink-400">Todas disponíveis</span>
                    )
                  }
                />
                <DataRow
                  label="Cobranças em aberto"
                  value={
                    openInvoices.length > 0 ? (
                      <span className="font-medium text-amber-600">
                        {openInvoices.length} ·{" "}
                        {formatCurrency(
                          openInvoices.reduce((sum, invoice) => sum + invoice.balance_due, 0)
                        )}
                      </span>
                    ) : (
                      <span className="text-emerald-600">Tudo em dia</span>
                    )
                  }
                />
              </CardContent>
            </Card>

            {(customer.street || customer.city) && (
              <Card>
                <CardHeader>
                  <CardTitle>Endereço</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="flex gap-2.5 text-[13px] leading-relaxed text-ink-600">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                    <span>
                      {[customer.street, customer.number, customer.complement]
                        .filter(Boolean)
                        .join(", ")}
                      {customer.district && <br />}
                      {customer.district}
                      {(customer.city || customer.state) && <br />}
                      {[customer.city, customer.state].filter(Boolean).join(" / ")}
                      {customer.zip_code && ` · ${formatZip(customer.zip_code)}`}
                    </span>
                  </p>
                </CardContent>
              </Card>
            )}

            {customer.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Anotações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-600">
                    {customer.notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {data.companies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Empresas vinculadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {data.companies.map((company) => (
                    <div
                      key={company.id}
                      className="flex items-start gap-3 rounded-lg border border-ink-200 px-3.5 py-2.5"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                        <Building2 className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink-900">
                          {company.trade_name || company.legal_name}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-500">
                          {company.cnpj ? formatDocument(company.cnpj) : "Sem CNPJ"}
                        </p>
                      </div>
                      <StatusBadge meta={ENTITY_STATUS[company.status]} size="sm" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </TabsContent>

      {/* --------------------------------------------------------- projetos */}
      <TabsContent value="projetos">
        {data.projects.length === 0 ? (
          <EmptyState
            icon={<Blocks />}
            title="Nenhum projeto ainda"
            description="Crie um projeto para gerar credenciais de API e começar a cobrar."
            action={
              <Button asChild>
                <Link href={`/projetos?cliente=${customer.id}&novo=1`}>Novo projeto</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.projects.map((project) => (
              <Link
                key={project.id}
                href={`/projetos/${project.id}`}
                className="group rounded-xl border border-ink-200 bg-white p-4 transition-all duration-200 hover:border-ink-300 hover:shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                      style={{ backgroundColor: project.color }}
                    />
                    <p className="truncate text-[13.5px] font-semibold text-ink-900">
                      {project.name}
                    </p>
                  </div>
                  <ArrowUpRight className="size-3.5 shrink-0 text-ink-300 transition-colors group-hover:text-brand-500" />
                </div>

                {project.primary_domain && (
                  <p className="mt-1.5 truncate text-[12px] text-ink-500">
                    {project.primary_domain}
                  </p>
                )}

                <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                  <StatusBadge meta={projectStatusMeta(project.status)} size="sm" />
                  {project.monthly_amount > 0 && (
                    <span className="text-[12.5px] font-medium text-ink-700 tabular-nums">
                      {formatCurrency(project.monthly_amount)}
                      <span className="text-ink-400">/mês</span>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </TabsContent>

      {/* -------------------------------------------------------- cobranças */}
      <TabsContent value="cobrancas">
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Cobrança</TH>
                <TH>Projeto</TH>
                <TH>Vencimento</TH>
                <TH className="text-right">Valor</TH>
                <TH className="text-right">Em aberto</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {data.invoices.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={<Receipt />}
                  title="Nenhuma cobrança emitida"
                  description="As cobranças deste cliente aparecerão aqui."
                />
              ) : (
                data.invoices.map((invoice) => (
                  <TR key={invoice.id}>
                    <TD>
                      <Link href={`/cobrancas/${invoice.id}`} className="group block">
                        <span className="block font-medium text-ink-900 group-hover:text-brand-600">
                          {invoice.description}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11.5px] text-ink-400">
                          {invoice.code}
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-ink-600">{invoice.project_name}</TD>
                    <TD>
                      <span className="text-ink-600">{formatDate(invoice.due_date)}</span>
                      {invoice.days_overdue > 0 && (
                        <span className="ml-1.5 text-[11.5px] font-medium text-rose-600">
                          +{invoice.days_overdue}d
                        </span>
                      )}
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink-900">
                      {formatCurrency(invoice.total)}
                    </TD>
                    <TD className="text-right tabular-nums text-ink-600">
                      {invoice.balance_due > 0 ? formatCurrency(invoice.balance_due) : "—"}
                    </TD>
                    <TD>
                      <StatusBadge meta={invoiceStatusMeta(invoice.status)} size="sm" />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      </TabsContent>

      {/* ------------------------------------------------------- pagamentos */}
      <TabsContent value="pagamentos">
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Método</TH>
                <TH className="text-right">Valor</TH>
                <TH className="text-right">Líquido</TH>
                <TH>Status</TH>
                <TH>Identificador</TH>
              </TR>
            </THead>
            <TBody>
              {data.payments.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={<CreditCard />}
                  title="Nenhum pagamento registrado"
                  description="Assim que o gateway confirmar um pagamento, ele aparece aqui."
                />
              ) : (
                data.payments.map((payment) => (
                  <TR key={payment.id}>
                    <TD className="text-ink-600">{formatDateTime(payment.created_at)}</TD>
                    <TD>
                      <StatusBadge meta={PAYMENT_METHOD[payment.method]} size="sm" />
                      {payment.installments > 1 && (
                        <span className="ml-1.5 text-[11.5px] text-ink-400">
                          {payment.installments}x
                        </span>
                      )}
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink-900">
                      {formatCurrency(payment.amount)}
                    </TD>
                    <TD className="text-right tabular-nums text-ink-500">
                      {payment.net_amount != null ? formatCurrency(payment.net_amount) : "—"}
                    </TD>
                    <TD>
                      <StatusBadge meta={PAYMENT_STATUS[payment.status]} size="sm" />
                    </TD>
                    <TD className="font-mono text-[11.5px] text-ink-400">
                      {payment.provider_payment_id ?? "—"}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      </TabsContent>

      {/* --------------------------------------------------------- contatos */}
      <TabsContent value="contatos">
        {data.contacts.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Nenhum contato adicional"
            description={`As notificações de cobrança são enviadas para ${customer.email}.`}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.contacts.map((contact) => (
              <Card key={contact.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-ink-900">
                        {contact.name}
                      </p>
                      {contact.role && (
                        <p className="mt-0.5 text-[12px] text-ink-500">{contact.role}</p>
                      )}
                    </div>
                    {contact.is_primary && (
                      <Badge tone="violet" size="sm">
                        <Star className="size-3" />
                        Principal
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3.5 space-y-1.5 border-t border-ink-100 pt-3 text-[12.5px]">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-2 text-ink-600 hover:text-brand-600"
                      >
                        <Mail className="size-3.5 shrink-0 text-ink-400" />
                        <span className="truncate">{contact.email}</span>
                      </a>
                    )}
                    {contact.phone && (
                      <p className="flex items-center gap-2 text-ink-600">
                        <Phone className="size-3.5 shrink-0 text-ink-400" />
                        {formatPhone(contact.phone)}
                      </p>
                    )}
                    {contact.receives_billing && (
                      <p className="flex items-center gap-2 text-ink-500">
                        <Receipt className="size-3.5 shrink-0 text-ink-400" />
                        Recebe as cobranças
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      {/* -------------------------------------------------------- histórico */}
      <TabsContent value="historico">
        {data.activity.length === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Sem histórico ainda"
            description="Cobranças, pagamentos e bloqueios deste cliente aparecerão nesta linha do tempo."
          />
        ) : (
          <ol className="relative space-y-1 border-l border-ink-200 pl-5">
            {data.activity.map((entry) => (
              <li key={entry.id} className="relative py-2.5">
                <span
                  aria-hidden
                  className="absolute -left-[23px] top-4 size-2 rounded-full bg-ink-300 ring-4 ring-white"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[13px] font-medium text-ink-900">{entry.title}</p>
                  <time className="text-[11.5px] text-ink-400" dateTime={entry.created_at}>
                    {formatRelative(entry.created_at)}
                  </time>
                </div>
                {entry.description && (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
                    {entry.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </TabsContent>
    </Tabs>
  );
}

/* ----------------------------------------------------------------- infra -- */

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5 first:pt-0 last:pb-0">
      <span className="text-[12.5px] text-ink-500">{label}</span>
      <span className="text-right text-[13px] text-ink-900">{value}</span>
    </div>
  );
}
