"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Blocks,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { CustomerFormModal } from "./customer-form";
import { archiveCustomerAction, deleteCustomerAction, restoreCustomerAction } from "@/server/customers";
import { ENTITY_STATUS } from "@/lib/labels";
import { formatCurrency, formatDocument, formatPhone } from "@/lib/format";
import type { Customer } from "@/lib/types";

export interface CustomerRow extends Customer {
  projects_count: number;
  total_open: number;
  total_overdue: number;
}

export function CustomersTable({
  rows,
  total,
  page,
  pageSize,
  canWrite,
}: {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [confirm, setConfirm] = React.useState<{
    kind: "archive" | "delete";
    customer: Customer;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setFormOpen(true);
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    const result =
      confirm.kind === "archive"
        ? await archiveCustomerAction(confirm.customer.id)
        : await deleteCustomerAction(confirm.customer.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      setConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  async function restore(customer: Customer) {
    const result = await restoreCustomerAction(customer.id);
    if (result.ok) {
      toast.success("Cliente reativado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Falha ao reativar");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por nome, e-mail ou documento..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ACTIVE", label: "Ativo" },
              { value: "INACTIVE", label: "Inativo" },
              { value: "ARCHIVED", label: "Arquivado" },
            ],
          },
          {
            key: "type",
            label: "Tipo",
            options: [
              { value: "PJ", label: "Pessoa jurídica" },
              { value: "PF", label: "Pessoa física" },
            ],
          },
        ]}
        right={
          canWrite && (
            <Button size="sm" onClick={openCreate} icon={<Plus />}>
              Novo cliente
            </Button>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Cliente</TH>
              <TH>Documento</TH>
              <TH>Contato</TH>
              <TH align="center">Projetos</TH>
              <TH align="right">Em aberto</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<Users />}
                title="Nenhum cliente encontrado"
                description="Cadastre seu primeiro cliente para começar a emitir cobranças e criar projetos."
                action={
                  canWrite && (
                    <Button size="sm" onClick={openCreate} icon={<Plus />}>
                      Cadastrar cliente
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((customer) => (
                <TR key={customer.id}>
                  <TD>
                    <Link
                      href={`/clientes/${customer.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <Avatar name={customer.name} src={customer.avatar_url} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-900 group-hover:text-brand-600">
                          {customer.legal_name || customer.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-400">
                          {customer.code} · {customer.type === "PJ" ? "PJ" : "PF"}
                          {customer.legal_name ? ` · ${customer.name}` : ""}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="font-mono text-[12px]">{formatDocument(customer.document)}</TD>
                  <TD>
                    <span className="block truncate">{customer.email}</span>
                    {customer.phone && (
                      <span className="block text-[11.5px] text-ink-400">
                        {formatPhone(customer.phone)}
                      </span>
                    )}
                  </TD>
                  <TD align="center">
                    {customer.projects_count > 0 ? (
                      <Badge tone="info" size="sm">
                        {customer.projects_count}
                      </Badge>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD align="right">
                    <span className="font-semibold tabular text-ink-900">
                      {formatCurrency(customer.total_open)}
                    </span>
                    {customer.total_overdue > 0 && (
                      <span className="block text-[11.5px] font-medium text-rose-600">
                        {formatCurrency(customer.total_overdue)} vencido
                      </span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge meta={ENTITY_STATUS[customer.status]} size="sm" />
                  </TD>
                  <TD>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="iconXs" aria-label="Ações">
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<ExternalLink />} asChild>
                          <Link href={`/clientes/${customer.id}`}>Abrir cliente</Link>
                        </MenuItem>
                        <MenuItem icon={<Blocks />} asChild>
                          <Link href={`/projetos?cliente=${customer.id}`}>Ver projetos</Link>
                        </MenuItem>
                        {canWrite && (
                          <>
                            <MenuSeparator />
                            <MenuItem icon={<Pencil />} onSelect={() => openEdit(customer)}>
                              Editar dados
                            </MenuItem>
                            {customer.status === "ARCHIVED" ? (
                              <MenuItem
                                icon={<ArchiveRestore />}
                                onSelect={() => void restore(customer)}
                              >
                                Reativar
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon={<Archive />}
                                onSelect={() => setConfirm({ kind: "archive", customer })}
                              >
                                Arquivar
                              </MenuItem>
                            )}
                            <MenuSeparator />
                            <MenuItem
                              icon={<Trash2 />}
                              destructive
                              onSelect={() => setConfirm({ kind: "delete", customer })}
                            >
                              Excluir
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

      {formOpen && (
        <CustomerFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          customer={editing}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "delete"
            ? `Excluir ${confirm.customer.name}?`
            : `Arquivar ${confirm?.customer.name}?`
        }
        description={
          confirm?.kind === "delete"
            ? "A exclusão é permanente e só é permitida para clientes sem cobranças ou pagamentos confirmados. Projetos vinculados sem histórico financeiro também serão removidos."
            : confirm?.kind === "archive"
              ? "O cliente deixa de aparecer nas listagens, mas todo o histórico é preservado."
              : undefined
        }
        confirmLabel={confirm?.kind === "delete" ? "Excluir definitivamente" : "Arquivar"}
        destructive={confirm?.kind === "delete"}
        loading={busy}
        onConfirm={runConfirm}
      />
    </>
  );
}
