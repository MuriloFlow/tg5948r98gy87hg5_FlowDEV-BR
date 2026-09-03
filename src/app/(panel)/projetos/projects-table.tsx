"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  Blocks,
  ExternalLink,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
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
import { ProjectFormModal, type CompanyOption, type CustomerOption } from "./project-form";
import {
  archiveProjectAction,
  blockProjectAction,
  deleteProjectAction,
  unblockProjectAction,
} from "@/server/projects";
import { PROJECT_STATUS, projectStatusMeta } from "@/lib/labels";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Project } from "@/lib/types";

export interface ProjectRow extends Project {
  customer_name: string;
  requests_24h: number;
  errors_24h: number;
  open_amount: number;
  active_keys: number;
}

type Pending = { kind: "block" | "archive" | "delete"; project: ProjectRow };

export function ProjectsTable({
  rows,
  total,
  page,
  pageSize,
  customers,
  companies,
  canWrite,
  canBlock,
  openNew,
}: {
  rows: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  customers: CustomerOption[];
  companies: CompanyOption[];
  canWrite: boolean;
  canBlock: boolean;
  openNew?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(Boolean(openNew));
  const [editing, setEditing] = React.useState<Project | null>(null);
  const [confirm, setConfirm] = React.useState<Pending | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setFormOpen(true);
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    const result =
      confirm.kind === "block"
        ? await blockProjectAction(confirm.project.id, reason)
        : confirm.kind === "delete"
          ? await deleteProjectAction(confirm.project.id)
          : await archiveProjectAction(confirm.project.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      setConfirm(null);
      setReason("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  async function unblock(project: ProjectRow) {
    const result = await unblockProjectAction(project.id);
    if (result.ok) {
      toast.success(result.message ?? "Acesso liberado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Falha ao liberar o acesso");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por nome, código ou domínio..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: (Object.keys(PROJECT_STATUS) as (keyof typeof PROJECT_STATUS)[]).map(
              (status) => ({ value: status, label: PROJECT_STATUS[status].label })
            ),
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
        ]}
        right={
          canWrite && (
            <Button size="sm" onClick={openCreate} icon={<Plus />}>
              Novo projeto
            </Button>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Projeto</TH>
              <TH>Cliente</TH>
              <TH>Status</TH>
              <TH align="right">Mensalidade</TH>
              <TH align="right">Em aberto</TH>
              <TH align="right">API 24h</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<Blocks />}
                title="Nenhum projeto encontrado"
                description="Cada projeto representa uma aplicação integrada: ele recebe credenciais de API, webhooks e cobranças próprias."
                action={
                  canWrite && (
                    <Button size="sm" onClick={openCreate} icon={<Plus />}>
                      Criar projeto
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((project) => (
                <TR key={project.id}>
                  <TD>
                    <Link href={`/projetos/${project.id}`} className="flex items-center gap-3 group">
                      <span
                        aria-hidden
                        className="size-8 shrink-0 rounded-lg ring-1 ring-inset ring-black/[0.06]"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-900 group-hover:text-brand-600">
                          {project.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-400">
                          {project.code}
                          {project.primary_domain ? ` · ${project.primary_domain}` : ""}
                          {project.environment === "TEST" ? " · TEST" : ""}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    <Link
                      href={`/clientes/${project.customer_id}`}
                      className="truncate hover:text-brand-600"
                    >
                      {project.customer_name}
                    </Link>
                  </TD>
                  <TD>
                    <StatusBadge meta={projectStatusMeta(project.status)} size="sm" />
                  </TD>
                  <TD align="right" className="tabular">
                    {Number(project.monthly_amount) > 0 ? (
                      <span className="font-medium text-ink-900">
                        {formatCurrency(project.monthly_amount)}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD align="right" className="tabular">
                    {project.open_amount > 0 ? (
                      <span className="font-semibold text-amber-700">
                        {formatCurrency(project.open_amount)}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD align="right">
                    <span className="tabular text-ink-700">
                      {formatNumber(project.requests_24h)}
                    </span>
                    {project.errors_24h > 0 && (
                      <Badge tone="danger" size="sm" className="ml-1.5">
                        {project.errors_24h} erro{project.errors_24h > 1 ? "s" : ""}
                      </Badge>
                    )}
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
                          <Link href={`/projetos/${project.id}`}>Abrir projeto</Link>
                        </MenuItem>
                        <MenuItem icon={<Receipt />} asChild>
                          <Link href={`/cobrancas?projeto=${project.id}`}>Ver cobranças</Link>
                        </MenuItem>
                        <MenuItem icon={<KeyRound />} asChild>
                          <Link href={`/credenciais?projeto=${project.id}`}>Credenciais</Link>
                        </MenuItem>

                        {canWrite && (
                          <>
                            <MenuSeparator />
                            <MenuItem icon={<Pencil />} onSelect={() => openEdit(project)}>
                              Editar projeto
                            </MenuItem>
                          </>
                        )}

                        {canBlock && (
                          <>
                            <MenuSeparator />
                            {project.status === "BLOCKED_PAYMENT" ||
                            project.status === "SUSPENDED" ? (
                              <MenuItem icon={<Unlock />} onSelect={() => void unblock(project)}>
                                Liberar acesso
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon={<Lock />}
                                onSelect={() => {
                                  setReason("");
                                  setConfirm({ kind: "block", project });
                                }}
                              >
                                Bloquear acesso
                              </MenuItem>
                            )}
                          </>
                        )}

                        {canWrite && project.status !== "ARCHIVED" && (
                          <>
                            <MenuSeparator />
                            <MenuItem
                              icon={<Archive />}
                              destructive
                              onSelect={() => setConfirm({ kind: "archive", project })}
                            >
                              Arquivar
                            </MenuItem>
                            <MenuItem
                              icon={<Trash2 />}
                              destructive
                              onSelect={() => setConfirm({ kind: "delete", project })}
                            >
                              Excluir projeto
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
        <ProjectFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          project={editing}
          customers={customers}
          companies={companies}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "block"
            ? `Bloquear ${confirm.project.name}?`
            : confirm?.kind === "delete"
              ? `Excluir ${confirm.project.name}?`
              : `Arquivar ${confirm?.project.name}?`
        }
        description={
          confirm?.kind === "block"
            ? "A aplicação passa a receber has_access: false no endpoint de entitlement e um evento project.blocked é disparado."
            : confirm?.kind === "delete"
              ? "A exclusão é permanente e só é permitida para projetos sem cobranças ou pagamentos confirmados. Credenciais e webhooks são removidos junto."
              : "O projeto sai das listagens e todas as credenciais ativas são revogadas."
        }
        confirmLabel={
          confirm?.kind === "block"
            ? "Bloquear acesso"
            : confirm?.kind === "delete"
              ? "Excluir definitivamente"
              : "Arquivar projeto"
        }
        destructive
        loading={busy}
        onConfirm={runConfirm}
      >
        {confirm?.kind === "block" ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-600">
              A aplicação passa a receber <code className="font-mono text-[12px]">has_access: false</code>{" "}
              e um evento <code className="font-mono text-[12px]">project.blocked</code> é enviado aos webhooks.
            </p>
            <Field label="Motivo" hint="Fica registrado na auditoria e no histórico do projeto">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: mensalidade de setembro em aberto há 12 dias"
                className="min-h-[70px]"
              />
            </Field>
          </div>
        ) : undefined}
      </ConfirmDialog>
    </>
  );
}
