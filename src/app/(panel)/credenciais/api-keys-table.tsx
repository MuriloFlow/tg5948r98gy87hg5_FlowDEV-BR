"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { CopyButton, Tooltip } from "@/components/ui/misc";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import {
  ApiKeyFormModal,
  SecretRevealModal,
  scopeLabel,
  type ProjectOption,
} from "./api-key-form";
import { revokeApiKeyAction, rotateApiKeyAction, type IssuedApiKey } from "@/server/apikeys";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { StatusMeta } from "@/lib/labels";
import type { ApiKey, ApiKeyStatus } from "@/lib/types";

export interface ApiKeyRow extends ApiKey {
  project_name: string;
}

const KEY_STATUS: Record<ApiKeyStatus, StatusMeta> = {
  ACTIVE: { label: "Ativa", tone: "success", description: "Autenticando requisições" },
  REVOKED: { label: "Revogada", tone: "danger", description: "Requisições recebem 401" },
  EXPIRED: { label: "Expirada", tone: "neutral", description: "Passou da data de validade" },
};

export function ApiKeysTable({
  rows,
  total,
  page,
  pageSize,
  projects,
  appUrl,
  canManage,
  defaultProjectId,
  openNew,
}: {
  rows: ApiKeyRow[];
  total: number;
  page: number;
  pageSize: number;
  projects: ProjectOption[];
  appUrl: string;
  canManage: boolean;
  defaultProjectId?: string | null;
  openNew?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(Boolean(openNew));
  const [editing, setEditing] = React.useState<ApiKey | null>(null);
  const [confirm, setConfirm] = React.useState<{
    kind: "revoke" | "rotate";
    key: ApiKeyRow;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<IssuedApiKey | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);

    if (confirm.kind === "revoke") {
      const result = await revokeApiKeyAction(confirm.key.id);
      setBusy(false);
      if (result.ok) {
        toast.success(result.message ?? "Chave revogada");
        setConfirm(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível revogar");
      }
      return;
    }

    const result = await rotateApiKeyAction(confirm.key.id);
    setBusy(false);
    if (result.ok && result.data) {
      setConfirm(null);
      setIssued(result.data);
    } else {
      toast.error(result.error ?? "Não foi possível rotacionar");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por nome ou key id..."
        filters={[
          {
            key: "projeto",
            label: "Projeto",
            options: projects.map((p) => ({ value: p.id, label: p.name })),
            allLabel: "Todos os projetos",
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ACTIVE", label: "Ativa" },
              { value: "REVOKED", label: "Revogada" },
              { value: "EXPIRED", label: "Expirada" },
            ],
          },
          {
            key: "ambiente",
            label: "Ambiente",
            options: [
              { value: "LIVE", label: "Produção (LIVE)" },
              { value: "TEST", label: "Testes (TEST)" },
            ],
          },
        ]}
        right={
          canManage && (
            <Button size="sm" onClick={openCreate} icon={<Plus />}>
              Nova chave
            </Button>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Chave</TH>
              <TH>Projeto</TH>
              <TH>Secret</TH>
              <TH>Escopos</TH>
              <TH align="right">Limite</TH>
              <TH>Último uso</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={<KeyRound />}
                title="Nenhuma credencial emitida"
                description="Gere uma chave para que a aplicação do cliente consiga autenticar na API do FlowDesk."
                action={
                  canManage && (
                    <Button size="sm" onClick={openCreate} icon={<Plus />}>
                      Gerar primeira chave
                    </Button>
                  )
                }
              />
            ) : (
              rows.map((key) => (
                <TR key={key.id}>
                  <TD>
                    <span className="block font-medium text-ink-900">{key.name}</span>
                    <span className="flex items-center gap-1">
                      <code className="font-mono text-[11.5px] text-ink-400">{key.key_id}</code>
                      <CopyButton value={key.key_id} label="Copiar key id" />
                    </span>
                  </TD>
                  <TD>
                    <Link
                      href={`/projetos/${key.project_id}`}
                      className="block truncate hover:text-brand-600"
                    >
                      {key.project_name}
                    </Link>
                    <Badge
                      tone={key.environment === "LIVE" ? "info" : "neutral"}
                      size="sm"
                      className="mt-0.5"
                    >
                      {key.environment}
                    </Badge>
                  </TD>
                  <TD>
                    <code className="font-mono text-[12px] text-ink-600">
                      {key.secret_prefix}
                      <span className="text-ink-300">••••••••</span>
                      {key.secret_last4}
                    </code>
                  </TD>
                  <TD>
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {key.scopes.slice(0, 2).map((scope) => (
                        <Tooltip key={scope} content={scopeLabel(scope)}>
                          <Badge tone="violet" size="sm" className="font-mono">
                            {scope}
                          </Badge>
                        </Tooltip>
                      ))}
                      {key.scopes.length > 2 && (
                        <Tooltip content={key.scopes.slice(2).map(scopeLabel).join(" · ")}>
                          <Badge tone="neutral" size="sm">
                            +{key.scopes.length - 2}
                          </Badge>
                        </Tooltip>
                      )}
                    </div>
                  </TD>
                  <TD align="right" className="tabular">
                    {formatNumber(key.rate_limit_per_minute)}
                    <span className="text-[11px] text-ink-400">/min</span>
                  </TD>
                  <TD>
                    {key.last_used_at ? (
                      <Tooltip content={formatDateTime(key.last_used_at)}>
                        <span>
                          <span className="block text-[12.5px]">
                            {formatRelative(key.last_used_at)}
                          </span>
                          <span className="block text-[11px] text-ink-400">
                            {formatNumber(Number(key.usage_count))} chamadas
                          </span>
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-[12.5px] text-ink-400">Nunca usada</span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge
                      meta={KEY_STATUS[key.status] ?? { label: key.status, tone: "neutral" }}
                      size="sm"
                    />
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
                          <Link href={`/projetos/${key.project_id}`}>Abrir projeto</Link>
                        </MenuItem>
                        {canManage && (
                          <>
                            <MenuSeparator />
                            <MenuItem
                              icon={<Pencil />}
                              onSelect={() => {
                                setEditing(key);
                                setFormOpen(true);
                              }}
                            >
                              Editar escopos e limites
                            </MenuItem>
                            <MenuItem
                              icon={<RefreshCcw />}
                              onSelect={() => setConfirm({ kind: "rotate", key })}
                            >
                              Rotacionar secret
                            </MenuItem>
                            {key.status === "ACTIVE" && (
                              <>
                                <MenuSeparator />
                                <MenuItem
                                  icon={<Ban />}
                                  destructive
                                  onSelect={() => setConfirm({ kind: "revoke", key })}
                                >
                                  Revogar chave
                                </MenuItem>
                              </>
                            )}
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
        <ApiKeyFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          apiKey={editing}
          projects={projects}
          defaultProjectId={defaultProjectId}
          appUrl={appUrl}
        />
      )}

      <SecretRevealModal
        open={Boolean(issued)}
        onOpenChange={(next) => !next && setIssued(null)}
        issued={issued}
        appUrl={appUrl}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "revoke"
            ? `Revogar ${confirm.key.name}?`
            : `Rotacionar ${confirm?.key.name}?`
        }
        description={
          confirm?.kind === "revoke"
            ? "Toda requisição feita com esta chave passa a receber 401 imediatamente. A ação não pode ser desfeita."
            : "Um novo secret é gerado e exibido uma única vez. O secret atual para de funcionar na hora."
        }
        confirmLabel={confirm?.kind === "revoke" ? "Revogar chave" : "Rotacionar agora"}
        destructive={confirm?.kind === "revoke"}
        loading={busy}
        onConfirm={runConfirm}
      />
    </>
  );
}
