"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  KeyRound,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, CopyButton } from "@/components/ui/misc";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  deactivateUserAction,
  inviteUserAction,
  reactivateUserAction,
  resetUserPasswordAction,
  revokeSessionsAction,
  updateUserRoleAction,
} from "@/server/team";
import type { ActionResult } from "@/server/action-utils";
import type { Permission } from "@/lib/auth/guard";
import { ADMIN_ROLE, ENTITY_STATUS } from "@/lib/labels";
import { formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import type { AdminRole, AdminUser, EntityStatus } from "@/lib/types";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: EntityStatus;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  must_change_password: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  active_sessions?: number;
}

const ROLES: AdminRole[] = ["OWNER", "ADMIN", "FINANCE", "SUPPORT", "READONLY"];

const PERMISSION_LABELS: Record<Permission, string> = {
  "customers:read": "Ver clientes",
  "customers:write": "Criar e editar clientes",
  "projects:read": "Ver projetos",
  "projects:write": "Criar e editar projetos",
  "projects:block": "Bloquear e liberar acesso",
  "billing:read": "Ver cobranças e pagamentos",
  "billing:write": "Emitir e editar cobranças",
  "payments:refund": "Estornar pagamentos",
  "apikeys:manage": "Gerenciar chaves de API",
  "webhooks:manage": "Gerenciar webhooks",
  "team:manage": "Gerenciar a equipe",
  "settings:manage": "Alterar configurações",
  "audit:read": "Consultar auditoria",
};

export function TeamClient({
  members,
  currentUserId,
  rolePermissions,
}: {
  members: TeamMember[];
  currentUserId: string;
  rolePermissions: Record<AdminRole, Permission[]>;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<{ name: string; password: string } | null>(null);
  const [confirm, setConfirm] = React.useState<{
    kind: "deactivate" | "reset" | "revoke";
    member: TeamMember;
  } | null>(null);

  async function perform(key: string, action: () => Promise<ActionResult>) {
    setBusy(key);
    const result = await action();
    setBusy(null);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      router.refresh();
      return result;
    }
    toast.error(result.error ?? "Não foi possível concluir");
    return result;
  }

  async function runConfirm() {
    if (!confirm) return;
    const { kind, member } = confirm;

    if (kind === "reset") {
      setBusy("confirm");
      const result = await resetUserPasswordAction(member.id);
      setBusy(null);
      if (result.ok && result.data) {
        setConfirm(null);
        setSecret({ name: member.name, password: result.data.temp_password });
        toast.success(result.message ?? "Senha redefinida");
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível redefinir a senha");
      }
      return;
    }

    const action =
      kind === "deactivate"
        ? () => deactivateUserAction(member.id)
        : () => revokeSessionsAction(member.id);

    const result = await perform("confirm", action);
    if (result.ok) setConfirm(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-500">
          {members.length} {members.length === 1 ? "usuário cadastrado" : "usuários cadastrados"}
        </p>
        <Button size="sm" icon={<UserPlus />} onClick={() => setInviteOpen(true)}>
          Convidar usuário
        </Button>
      </div>

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Usuário</TH>
              <TH>Papel</TH>
              <TH>Último acesso</TH>
              <TH align="center">Sessões</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {members.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<ShieldCheck />}
                title="Nenhum usuário cadastrado"
                description="Convide as pessoas que vão operar cobranças, projetos e integrações."
                action={
                  <Button size="sm" icon={<UserPlus />} onClick={() => setInviteOpen(true)}>
                    Convidar usuário
                  </Button>
                }
              />
            ) : (
              members.map((member) => (
                <TR key={member.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} src={member.avatar_url} size="sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-ink-900">{member.name}</span>
                          {member.id === currentUserId && (
                            <Badge tone="info" size="sm">
                              você
                            </Badge>
                          )}
                          {member.must_change_password && (
                            <Badge tone="warning" size="sm">
                              senha provisória
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-400">
                          {member.email}
                          {member.phone ? ` · ${formatPhone(member.phone)}` : ""}
                        </span>
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge meta={ADMIN_ROLE[member.role]} size="sm" />
                  </TD>
                  <TD>
                    {member.last_login_at ? (
                      <>
                        <span className="block text-[12.5px] text-ink-700">
                          {formatRelative(member.last_login_at)}
                        </span>
                        <span className="block text-[11px] text-ink-400">
                          {formatDateTime(member.last_login_at)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[12.5px] text-ink-400">nunca acessou</span>
                    )}
                  </TD>
                  <TD align="center">
                    {(member.active_sessions ?? 0) > 0 ? (
                      <Badge tone="success" size="sm">
                        {member.active_sessions}
                      </Badge>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge meta={ENTITY_STATUS[member.status]} size="sm" />
                  </TD>
                  <TD>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="iconXs" aria-label="Ações do usuário">
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent className="min-w-[230px]">
                        <MenuLabel>Papel</MenuLabel>
                        {ROLES.map((role) => (
                          <MenuItem
                            key={role}
                            icon={role === member.role ? <Check /> : <span className="size-4" />}
                            disabled={role === member.role || busy !== null}
                            onSelect={() =>
                              void perform(`role:${member.id}`, () =>
                                updateUserRoleAction(member.id, role)
                              )
                            }
                          >
                            {ADMIN_ROLE[role].label}
                          </MenuItem>
                        ))}

                        <MenuSeparator />
                        <MenuItem
                          icon={<KeyRound />}
                          onSelect={() => setConfirm({ kind: "reset", member })}
                        >
                          Redefinir senha
                        </MenuItem>
                        <MenuItem
                          icon={<LogOut />}
                          onSelect={() => setConfirm({ kind: "revoke", member })}
                        >
                          Encerrar todas as sessões
                        </MenuItem>

                        <MenuSeparator />
                        {member.status === "ACTIVE" ? (
                          <MenuItem
                            icon={<UserX />}
                            destructive
                            disabled={member.id === currentUserId}
                            onSelect={() => setConfirm({ kind: "deactivate", member })}
                          >
                            Desativar acesso
                          </MenuItem>
                        ) : (
                          <MenuItem
                            icon={<UserCheck />}
                            onSelect={() =>
                              void perform(`activate:${member.id}`, () =>
                                reactivateUserAction(member.id)
                              )
                            }
                          >
                            Reativar acesso
                          </MenuItem>
                        )}
                      </MenuContent>
                    </Menu>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>

      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>O que cada papel pode fazer</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              As permissões são fixas por papel — escolha o papel pelo conjunto de tarefas da pessoa.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ROLES.map((role) => {
              const permissions = rolePermissions[role] ?? [];
              return (
                <div
                  key={role}
                  className="space-y-2.5 rounded-xl border border-ink-200 bg-white p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge meta={ADMIN_ROLE[role]} size="sm" />
                    <span className="text-[11px] text-ink-400">
                      {permissions.length} permissões
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-ink-500">
                    {ADMIN_ROLE[role].description}
                  </p>
                  <ul className="space-y-1">
                    {permissions.map((permission) => (
                      <li
                        key={permission}
                        className="flex items-start gap-1.5 text-[12px] text-ink-700"
                      >
                        <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                        {PERMISSION_LABELS[permission] ?? permission}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <InviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(name, password) => setSecret({ name, password })}
      />

      <Modal
        open={Boolean(secret)}
        onOpenChange={(open) => !open && setSecret(null)}
        title="Senha temporária"
        description="Ela aparece uma única vez. Envie por um canal seguro — o usuário será obrigado a trocá-la no primeiro acesso."
        size="sm"
        icon={<KeyRound />}
        footer={
          <Button onClick={() => setSecret(null)}>Já copiei a senha</Button>
        }
      >
        {secret && (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-600">
              Senha provisória de <strong className="text-ink-900">{secret.name}</strong>:
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
              <code className="flex-1 select-all break-all font-mono text-[13px] text-ink-900">
                {secret.password}
              </code>
              <CopyButton value={secret.password} variant="secondary" size="iconSm" />
            </div>
            <p className="text-[12px] leading-relaxed text-ink-500">
              Todas as sessões anteriores desse usuário foram encerradas.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "deactivate"
            ? `Desativar ${confirm.member.name}?`
            : confirm?.kind === "reset"
              ? `Redefinir a senha de ${confirm.member.name}?`
              : `Encerrar as sessões de ${confirm?.member.name}?`
        }
        description={
          confirm?.kind === "deactivate"
            ? "O usuário perde o acesso imediatamente e todas as sessões são encerradas. O histórico de ações é preservado."
            : confirm?.kind === "reset"
              ? "Uma senha temporária será gerada e exibida uma única vez. As sessões atuais serão encerradas."
              : "O usuário precisará entrar novamente em todos os dispositivos."
        }
        confirmLabel={
          confirm?.kind === "deactivate"
            ? "Desativar acesso"
            : confirm?.kind === "reset"
              ? "Gerar nova senha"
              : "Encerrar sessões"
        }
        destructive={confirm?.kind === "deactivate"}
        loading={busy === "confirm"}
        onConfirm={runConfirm}
      />
    </div>
  );
}

function InviteModal({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (name: string, password: string) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ user: AdminUser; temp_password: string }> | null,
    FormData
  >(inviteUserAction, null);
  const [role, setRole] = React.useState<AdminRole>("SUPPORT");

  React.useEffect(() => {
    if (state?.ok && state.data) {
      onOpenChange(false);
      onInvited(state.data.user.name, state.data.temp_password);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state?.fieldErrors ?? {};

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Convidar usuário"
      description="O acesso é criado com uma senha temporária que você entrega à pessoa."
      size="md"
      icon={<UserPlus />}
      locked={pending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="invite-form" loading={pending} icon={<UserPlus />}>
            Criar acesso
          </Button>
        </>
      }
    >
      <form id="invite-form" action={formAction} className="space-y-5">
        <FormError message={state?.error} />

        <FieldGroup>
          <Field label="Nome completo" htmlFor="name" error={errors.name} required>
            <Input id="name" name="name" placeholder="Ana Ribeiro" required />
          </Field>

          <Field label="E-mail" htmlFor="email" error={errors.email} required>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="ana@suaempresa.com.br"
              required
            />
          </Field>

          <Field label="Telefone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" name="phone" placeholder="(11) 90000-0000" />
          </Field>

          <Field label="Papel" htmlFor="role" error={errors.role} required>
            <NativeSelect
              id="role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
            >
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {ADMIN_ROLE[option].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>

        <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
          <p className="text-[12.5px] font-medium text-ink-800">
            {ADMIN_ROLE[role].label} pode:
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
            {ADMIN_ROLE[role].description}
          </p>
        </div>
      </form>
    </Modal>
  );
}
