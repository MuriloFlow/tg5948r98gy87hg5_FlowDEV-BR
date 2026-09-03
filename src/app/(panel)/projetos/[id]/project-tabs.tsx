"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Archive,
  Ban,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Plus,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Wallet,
  Webhook as WebhookIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  CopyButton,
  EmptyState,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@/components/ui/misc";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProjectFormModal, type CompanyOption, type CustomerOption } from "../project-form";
import {
  ApiKeyFormModal,
  SecretRevealModal,
  scopeLabel,
  type ProjectOption,
} from "../../credenciais/api-key-form";
import { WebhookFormModal } from "../../webhooks/webhook-form";
import {
  archiveProjectAction,
  blockProjectAction,
  suspendProjectAction,
  deleteProjectAction,
  toggleBlockModeAction,
  unblockProjectAction,
  updateGraceDaysAction,
} from "@/server/projects";
import { revokeApiKeyAction, rotateApiKeyAction, type IssuedApiKey } from "@/server/apikeys";
import {
  deleteWebhookEndpointAction,
  replayDeliveryAction,
  rotateWebhookSecretAction,
  sendTestEventAction,
  toggleWebhookEndpointAction,
} from "@/server/webhook-endpoints";
import { DELIVERY_STATUS, eventLabel, invoiceStatusMeta } from "@/lib/labels";
import {
  daysBetween,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
} from "@/lib/format";
import type {
  ActivityEntry,
  ApiKey,
  InvoiceFull,
  Project,
  ProjectEntitlement,
  ProjectHealth,
  WebhookEndpoint,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ProjectDelivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  attempt: number;
  status: keyof typeof DELIVERY_STATUS;
  response_status: number | null;
  duration_ms: number | null;
  created_at: string;
}

function deliveryMeta(status: ProjectDelivery["status"]) {
  return DELIVERY_STATUS[status] ?? { label: status, tone: "neutral" as const };
}

export interface ProjectPermissions {
  write: boolean;
  block: boolean;
  keys: boolean;
  webhooks: boolean;
}

interface SharedProps {
  project: Project;
  customers: CustomerOption[];
  companies: CompanyOption[];
  permissions: ProjectPermissions;
}

/* ------------------------------------------------------ Header actions -- */

export function ProjectHeaderActions({
  project,
  customers,
  companies,
  permissions,
}: SharedProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [blocking, setBlocking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const hasAccess = project.status === "ACTIVE" || project.status === "TRIAL";

  async function confirmBlock() {
    setBusy(true);
    const result = await blockProjectAction(project.id, reason);
    setBusy(false);
    if (result.ok) {
      toast.success(result.message ?? "Acesso bloqueado");
      setBlocking(false);
      setReason("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível bloquear");
    }
  }

  async function unblock() {
    const result = await unblockProjectAction(project.id);
    if (result.ok) {
      toast.success(result.message ?? "Acesso liberado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível liberar");
    }
  }

  return (
    <>
      {permissions.block &&
        (hasAccess ? (
          <Button variant="secondary" icon={<Lock />} onClick={() => setBlocking(true)}>
            Bloquear acesso
          </Button>
        ) : (
          <Button variant="secondary" icon={<Unlock />} onClick={() => void unblock()}>
            Liberar acesso
          </Button>
        ))}

      <Button variant="secondary" asChild>
        <Link href={`/cobrancas?projeto=${project.id}&novo=1`}>
          <Receipt />
          Nova cobrança
        </Link>
      </Button>

      {permissions.write && (
        <Button icon={<Pencil />} onClick={() => setFormOpen(true)}>
          Editar
        </Button>
      )}

      {formOpen && (
        <ProjectFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          project={project}
          customers={customers}
          companies={companies}
        />
      )}

      <ConfirmDialog
        open={blocking}
        onOpenChange={setBlocking}
        title={`Bloquear ${project.name}?`}
        confirmLabel="Bloquear acesso"
        destructive
        loading={busy}
        onConfirm={confirmBlock}
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-600">
            A aplicação passa a receber{" "}
            <span className="font-mono text-[12.5px]">has_access: false</span> e um evento{" "}
            <span className="font-mono text-[12.5px]">project.blocked</span> é disparado.
          </p>
          <Field label="Motivo" hint="Fica registrado na auditoria">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex.: mensalidade em aberto há 15 dias"
              className="min-h-[70px]"
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

/* -------------------------------------------------------------- Pieces -- */

function InfoCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-500",
    success: "bg-emerald-50 text-emerald-600",
    danger: "bg-rose-50 text-rose-600",
    warning: "bg-amber-50 text-amber-600",
    info: "bg-sky-50 text-sky-600",
  };

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
              tones[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">{hint}</div>}
    </div>
  );
}

function Timeline({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Activity />}
        title="Sem atividade registrada"
        description="Criação de cobranças, pagamentos e mudanças de acesso aparecem aqui em ordem cronológica."
        className="border-0 bg-transparent py-8"
      />
    );
  }

  return (
    <ol className="px-5 py-4">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < entries.length - 1 && (
            <span className="absolute left-[11px] top-6 h-full w-px bg-ink-200" aria-hidden />
          )}
          <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
            {entry.kind === "payment" ? (
              <CreditCard className="size-3" />
            ) : entry.kind === "status_changed" ? (
              <ShieldCheck className="size-3" />
            ) : (
              <Receipt className="size-3" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium leading-snug text-ink-800">{entry.title}</p>
            {entry.description && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">
                {entry.description}
              </p>
            )}
            <p className="mt-0.5 text-[11px] text-ink-400">
              {formatRelative(entry.created_at)}
              {entry.actor_label ? ` · ${entry.actor_label}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- Tabs -- */

export function ProjectTabs({
  project,
  customers,
  companies,
  permissions,
  entitlement,
  health,
  invoices,
  apiKeys,
  endpoints,
  deliveries,
  activity,
  appUrl,
}: SharedProps & {
  entitlement: ProjectEntitlement | null;
  health: ProjectHealth | null;
  invoices: InvoiceFull[];
  apiKeys: ApiKey[];
  endpoints: WebhookEndpoint[];
  deliveries: ProjectDelivery[];
  activity: ActivityEntry[];
  appUrl: string;
}) {
  const router = useRouter();

  const [keyFormOpen, setKeyFormOpen] = React.useState(false);
  const [editingKey, setEditingKey] = React.useState<ApiKey | null>(null);
  const [issued, setIssued] = React.useState<IssuedApiKey | null>(null);
  const [keyConfirm, setKeyConfirm] = React.useState<{
    kind: "revoke" | "rotate";
    key: ApiKey;
  } | null>(null);

  const [hookFormOpen, setHookFormOpen] = React.useState(false);
  const [editingHook, setEditingHook] = React.useState<WebhookEndpoint | null>(null);
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  const [hookConfirm, setHookConfirm] = React.useState<{
    kind: "delete" | "rotate";
    endpoint: WebhookEndpoint;
  } | null>(null);

  const [projectFormOpen, setProjectFormOpen] = React.useState(false);
  const [danger, setDanger] = React.useState<"suspend" | "archive" | "delete" | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [replaying, setReplaying] = React.useState<string | null>(null);
  const [grace, setGrace] = React.useState(String(project.grace_days));

  const projectOption: ProjectOption[] = [
    { id: project.id, name: project.name, environment: project.environment },
  ];

  const openAmount = Number(entitlement?.open_amount ?? health?.open_amount ?? 0);
  const nextInvoice = invoices
    .filter((invoice) => ["OPEN", "PENDING", "OVERDUE", "PARTIALLY_PAID"].includes(invoice.status))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const hasAccess = entitlement?.has_access ?? ["ACTIVE", "TRIAL"].includes(project.status);

  async function handle(promise: Promise<{ ok: boolean; message?: string; error?: string }>) {
    const result = await promise;
    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
    return result;
  }

  async function runKeyConfirm() {
    if (!keyConfirm) return;
    setBusy(true);
    if (keyConfirm.kind === "revoke") {
      const result = await revokeApiKeyAction(keyConfirm.key.id);
      setBusy(false);
      if (result.ok) {
        toast.success(result.message ?? "Chave revogada");
        setKeyConfirm(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Falha ao revogar");
      }
      return;
    }
    const result = await rotateApiKeyAction(keyConfirm.key.id);
    setBusy(false);
    if (result.ok && result.data) {
      setKeyConfirm(null);
      setIssued(result.data);
    } else {
      toast.error(result.error ?? "Falha ao rotacionar");
    }
  }

  async function runHookConfirm() {
    if (!hookConfirm) return;
    setBusy(true);
    const result =
      hookConfirm.kind === "delete"
        ? await deleteWebhookEndpointAction(hookConfirm.endpoint.id)
        : await rotateWebhookSecretAction(hookConfirm.endpoint.id);
    setBusy(false);
    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      if (hookConfirm.kind === "rotate") {
        setRevealed((current) => ({ ...current, [hookConfirm.endpoint.id]: true }));
      }
      setHookConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  async function runDanger() {
    if (!danger) return;
    setBusy(true);
    const result =
      danger === "suspend"
        ? await suspendProjectAction(project.id, reason)
        : danger === "delete"
          ? await deleteProjectAction(project.id)
          : await archiveProjectAction(project.id);
    setBusy(false);
    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      setDanger(null);
      setReason("");
      if (danger === "delete") {
        router.push("/projetos");
        return;
      }
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  return (
    <>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="invoices">
            Cobranças
            {invoices.length > 0 && (
              <span className="ml-1.5 text-[11px] text-ink-400">{invoices.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="keys">
            Credenciais
            {apiKeys.length > 0 && (
              <span className="ml-1.5 text-[11px] text-ink-400">{apiKeys.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            Webhooks
            {endpoints.length > 0 && (
              <span className="ml-1.5 text-[11px] text-ink-400">{endpoints.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ Overview */}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard
              label="Acesso da aplicação"
              value={
                <span className={hasAccess ? "text-emerald-600" : "text-rose-600"}>
                  {hasAccess ? "Liberado" : "Bloqueado"}
                </span>
              }
              hint={
                project.blocked_reason
                  ? project.blocked_reason
                  : `has_access: ${String(hasAccess)} · modo ${
                      project.block_mode === "AUTO" ? "automático" : "manual"
                    }`
              }
              icon={hasAccess ? <ShieldCheck /> : <ShieldAlert />}
              tone={hasAccess ? "success" : "danger"}
            />
            <InfoCard
              label="Valor mensal"
              value={formatCurrency(project.monthly_amount)}
              hint={
                Number(project.contract_value) > 0
                  ? `Contrato: ${formatCurrency(project.contract_value)}`
                  : "Sem valor de contrato definido"
              }
              icon={<Wallet />}
              tone="info"
            />
            <InfoCard
              label="Em aberto"
              value={formatCurrency(openAmount)}
              hint={`${entitlement?.open_invoices ?? 0} cobrança(s) aguardando pagamento`}
              icon={<Receipt />}
              tone={openAmount > 0 ? "warning" : "neutral"}
            />
            <InfoCard
              label="Próxima cobrança"
              value={nextInvoice ? formatCurrency(nextInvoice.total) : "—"}
              hint={
                nextInvoice
                  ? `${nextInvoice.code} · vence ${formatDate(nextInvoice.due_date)}`
                  : "Nenhuma cobrança futura programada"
              }
              icon={<CalendarClock />}
              tone={
                nextInvoice && daysBetween(nextInvoice.due_date) < 0 ? "danger" : "neutral"
              }
            />
          </div>

          {entitlement?.blocking_invoice_id && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                <ShieldAlert className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-rose-900">
                  Cobrança {entitlement.blocking_invoice_code} está travando o acesso
                </p>
                <p className="truncate text-[12.5px] text-rose-700/85">
                  {entitlement.blocking_invoice_description} ·{" "}
                  {formatCurrency(entitlement.blocking_invoice_total)} · venceu em{" "}
                  {formatDate(entitlement.blocking_invoice_due_date)}
                </p>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/cobrancas/${entitlement.blocking_invoice_id}`}>Abrir cobrança</Link>
              </Button>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Integração</CardTitle>
                <Badge tone={project.environment === "LIVE" ? "info" : "neutral"} size="sm">
                  {project.environment}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-500">Chaves ativas</span>
                  <span className="font-medium text-ink-900">
                    {apiKeys.filter((k) => k.status === "ACTIVE").length}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-500">Chamadas nas últimas 24h</span>
                  <span className="font-medium tabular text-ink-900">
                    {formatNumber(Number(health?.requests_24h ?? 0))}
                    {Number(health?.errors_24h ?? 0) > 0 && (
                      <span className="ml-1.5 text-[11.5px] font-normal text-rose-600">
                        {formatNumber(Number(health?.errors_24h))} com erro
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-500">Última chamada</span>
                  <span className="font-medium text-ink-900">
                    {health?.last_api_call ? formatRelative(health.last_api_call) : "Nunca"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-500">Webhooks ativos</span>
                  <span className="font-medium text-ink-900">
                    {endpoints.filter((e) => e.status === "ACTIVE").length}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-ink-200/70 pt-3">
                  <span className="text-ink-500">Domínios</span>
                  <span className="min-w-0 text-right font-medium text-ink-900">
                    {[project.primary_domain, ...project.domains].filter(Boolean).join(", ") ||
                      "—"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-500">Identificador</span>
                  <span className="flex items-center gap-1 font-mono text-[12px] text-ink-700">
                    {project.slug}
                    <CopyButton value={project.slug} />
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-500">Início</span>
                  <span className="font-medium text-ink-900">
                    {project.started_at ? formatDate(project.started_at) : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Histórico do projeto</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <Timeline entries={activity} />
              </CardContent>
            </Card>
          </div>

          {project.description && (
            <Card>
              <CardHeader>
                <CardTitle>Sobre o projeto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[13px] leading-relaxed text-ink-600">{project.description}</p>
                {project.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <Badge key={tag} tone="neutral" size="sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ------------------------------------------------------ Invoices */}
        <TabsContent value="invoices">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Cobrança</TH>
                  <TH>Vencimento</TH>
                  <TH>Status</TH>
                  <TH align="right">Valor</TH>
                  <TH align="right">Saldo</TH>
                </tr>
              </THead>
              <TBody>
                {invoices.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    icon={<Receipt />}
                    title="Nenhuma cobrança emitida"
                    description="Gere a primeira cobrança deste projeto para começar a receber."
                    action={
                      <Button size="sm" asChild>
                        <Link href={`/cobrancas?projeto=${project.id}&novo=1`}>
                          <Plus />
                          Nova cobrança
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  invoices.map((invoice) => (
                    <TR key={invoice.id} clickable>
                      <TD>
                        <Link href={`/cobrancas/${invoice.id}`} className="block">
                          <span className="block font-medium text-ink-900">
                            {invoice.description}
                          </span>
                          <span className="font-mono text-[11.5px] text-ink-400">
                            {invoice.code}
                            {invoice.reference ? ` · ${invoice.reference}` : ""}
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        {formatDate(invoice.due_date)}
                        {invoice.status === "OVERDUE" && (
                          <span className="block text-[11px] font-medium text-rose-600">
                            {Math.abs(daysBetween(invoice.due_date))} dias de atraso
                          </span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge meta={invoiceStatusMeta(invoice.status)} size="sm" />
                      </TD>
                      <TD align="right" className="font-semibold tabular">
                        {formatCurrency(invoice.total)}
                      </TD>
                      <TD align="right" className="tabular">
                        {Number(invoice.balance_due) > 0 ? (
                          <span className="font-medium text-amber-700">
                            {formatCurrency(invoice.balance_due)}
                          </span>
                        ) : (
                          <span className="text-emerald-600">Quitada</span>
                        )}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </TabsContent>

        {/* --------------------------------------------------------- Keys */}
        <TabsContent value="keys" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-500">
              As chaves autenticam as chamadas desta aplicação. O secret aparece uma única vez na
              criação — depois só é possível rotacioná-lo.
            </p>
            {permissions.keys && (
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setEditingKey(null);
                  setKeyFormOpen(true);
                }}
              >
                Nova chave
              </Button>
            )}
          </div>

          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Chave</TH>
                  <TH>Secret</TH>
                  <TH>Escopos</TH>
                  <TH align="right">Limite</TH>
                  <TH>Último uso</TH>
                  <TH>Status</TH>
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {apiKeys.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    icon={<KeyRound />}
                    title="Sem credenciais"
                    description="Gere uma chave para que esta aplicação consiga autenticar na API."
                    action={
                      permissions.keys && (
                        <Button
                          size="sm"
                          icon={<Plus />}
                          onClick={() => {
                            setEditingKey(null);
                            setKeyFormOpen(true);
                          }}
                        >
                          Gerar chave
                        </Button>
                      )
                    }
                  />
                ) : (
                  apiKeys.map((key) => (
                    <TR key={key.id}>
                      <TD>
                        <span className="block font-medium text-ink-900">{key.name}</span>
                        <span className="flex items-center gap-1">
                          <code className="font-mono text-[11.5px] text-ink-400">
                            {key.key_id}
                          </code>
                          <CopyButton value={key.key_id} label="Copiar key id" />
                        </span>
                      </TD>
                      <TD>
                        <code className="font-mono text-[12px] text-ink-600">
                          {key.secret_prefix}
                          <span className="text-ink-300">••••••••</span>
                          {key.secret_last4}
                        </code>
                      </TD>
                      <TD>
                        <div className="flex max-w-[200px] flex-wrap gap-1">
                          {key.scopes.slice(0, 2).map((scope) => (
                            <Tooltip key={scope} content={scopeLabel(scope)}>
                              <Badge tone="violet" size="sm" className="font-mono">
                                {scope}
                              </Badge>
                            </Tooltip>
                          ))}
                          {key.scopes.length > 2 && (
                            <Badge tone="neutral" size="sm">
                              +{key.scopes.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD align="right" className="tabular">
                        {formatNumber(key.rate_limit_per_minute)}
                        <span className="text-[11px] text-ink-400">/min</span>
                      </TD>
                      <TD className="text-[12.5px]">
                        {key.last_used_at ? formatRelative(key.last_used_at) : "Nunca usada"}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            key.status === "ACTIVE"
                              ? "success"
                              : key.status === "REVOKED"
                                ? "danger"
                                : "neutral"
                          }
                          size="sm"
                          dot
                        >
                          {key.status === "ACTIVE"
                            ? "Ativa"
                            : key.status === "REVOKED"
                              ? "Revogada"
                              : "Expirada"}
                        </Badge>
                      </TD>
                      <TD>
                        {permissions.keys && (
                          <Menu>
                            <MenuTrigger asChild>
                              <Button variant="ghost" size="iconXs" aria-label="Ações">
                                <MoreHorizontal />
                              </Button>
                            </MenuTrigger>
                            <MenuContent>
                              <MenuItem
                                icon={<Pencil />}
                                onSelect={() => {
                                  setEditingKey(key);
                                  setKeyFormOpen(true);
                                }}
                              >
                                Editar escopos
                              </MenuItem>
                              <MenuItem
                                icon={<RefreshCcw />}
                                onSelect={() => setKeyConfirm({ kind: "rotate", key })}
                              >
                                Rotacionar secret
                              </MenuItem>
                              {key.status === "ACTIVE" && (
                                <>
                                  <MenuSeparator />
                                  <MenuItem
                                    icon={<Ban />}
                                    destructive
                                    onSelect={() => setKeyConfirm({ kind: "revoke", key })}
                                  >
                                    Revogar
                                  </MenuItem>
                                </>
                              )}
                            </MenuContent>
                          </Menu>
                        )}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </TabsContent>

        {/* ----------------------------------------------------- Webhooks */}
        <TabsContent value="webhooks" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-500">
              Endpoints que recebem os eventos deste projeto, assinados no header{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11.5px]">
                X-FlowDesk-Signature
              </code>
              .
            </p>
            <div className="flex items-center gap-2">
              {permissions.webhooks && endpoints.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Send />}
                  onClick={() => void handle(sendTestEventAction(project.id))}
                >
                  Enviar evento de teste
                </Button>
              )}
              {permissions.webhooks && (
                <Button
                  size="sm"
                  icon={<Plus />}
                  onClick={() => {
                    setEditingHook(null);
                    setHookFormOpen(true);
                  }}
                >
                  Novo endpoint
                </Button>
              )}
            </div>
          </div>

          {endpoints.length === 0 ? (
            <EmptyState
              icon={<WebhookIcon />}
              title="Nenhum endpoint configurado"
              description="Cadastre a URL da aplicação para receber eventos de pagamento e bloqueio em tempo real."
              action={
                permissions.webhooks && (
                  <Button
                    size="sm"
                    icon={<Plus />}
                    onClick={() => {
                      setEditingHook(null);
                      setHookFormOpen(true);
                    }}
                  >
                    Criar endpoint
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              {endpoints.map((endpoint) => (
                <Card key={endpoint.id}>
                  <CardHeader className="items-start">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all font-mono text-[13px] font-medium text-ink-900">
                          {endpoint.url}
                        </code>
                        <CopyButton value={endpoint.url} label="Copiar URL" />
                      </div>
                      <p className="text-[12.5px] text-ink-500">
                        {formatNumber(Number(endpoint.total_deliveries))} entregas
                        {endpoint.consecutive_failures > 0
                          ? ` · ${endpoint.consecutive_failures} falha(s) seguida(s)`
                          : ""}
                        {endpoint.last_success_at
                          ? ` · último sucesso ${formatRelative(endpoint.last_success_at)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {permissions.webhooks && (
                        <Switch
                          checked={endpoint.status === "ACTIVE"}
                          onCheckedChange={(checked) =>
                            void handle(toggleWebhookEndpointAction(endpoint.id, checked))
                          }
                          aria-label="Ativar endpoint"
                        />
                      )}
                      {permissions.webhooks && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="iconXs" aria-label="Ações">
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem
                              icon={<Pencil />}
                              onSelect={() => {
                                setEditingHook(endpoint);
                                setHookFormOpen(true);
                              }}
                            >
                              Editar endpoint
                            </MenuItem>
                            <MenuItem
                              icon={<RefreshCcw />}
                              onSelect={() => setHookConfirm({ kind: "rotate", endpoint })}
                            >
                              Rotacionar secret
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                              icon={<Trash2 />}
                              destructive
                              onSelect={() => setHookConfirm({ kind: "delete", endpoint })}
                            >
                              Remover
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {endpoint.events.map((type) => (
                        <Tooltip key={type} content={eventLabel(type)}>
                          <Badge tone="info" size="sm" className="font-mono">
                            {type}
                          </Badge>
                        </Tooltip>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Signing secret
                      </span>
                      <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-700">
                        {revealed[endpoint.id]
                          ? endpoint.secret
                          : `${endpoint.secret.slice(0, 11)}${"•".repeat(24)}`}
                      </code>
                      <Button
                        variant="ghost"
                        size="iconXs"
                        aria-label={revealed[endpoint.id] ? "Ocultar secret" : "Revelar secret"}
                        onClick={() =>
                          setRevealed((current) => ({
                            ...current,
                            [endpoint.id]: !current[endpoint.id],
                          }))
                        }
                      >
                        {revealed[endpoint.id] ? <EyeOff /> : <Eye />}
                      </Button>
                      <CopyButton value={endpoint.secret} label="Copiar secret" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div>
            <h3 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
              Últimas entregas
            </h3>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Evento</TH>
                    <TH>Status</TH>
                    <TH align="center">HTTP</TH>
                    <TH align="right">Duração</TH>
                    <TH align="center">Tentativa</TH>
                    <TH>Quando</TH>
                    <TH className="w-10" />
                  </tr>
                </THead>
                <TBody>
                  {deliveries.length === 0 ? (
                    <TableEmpty
                      colSpan={7}
                      icon={<Send />}
                      title="Nenhuma entrega ainda"
                      description="Dispare um evento de teste para validar a integração de ponta a ponta."
                    />
                  ) : (
                    deliveries.map((delivery) => (
                      <TR key={delivery.id}>
                        <TD>
                          <span className="block font-mono text-[12px] font-medium text-ink-900">
                            {delivery.event_type}
                          </span>
                          <span className="block text-[11.5px] text-ink-400">
                            {eventLabel(delivery.event_type)}
                          </span>
                        </TD>
                        <TD>
                          <StatusBadge meta={deliveryMeta(delivery.status)} size="sm" />
                        </TD>
                        <TD align="center">
                          {delivery.response_status ? (
                            <span
                              className={cn(
                                "font-mono text-[12px] font-semibold",
                                delivery.response_status < 300
                                  ? "text-emerald-600"
                                  : delivery.response_status < 500
                                    ? "text-amber-600"
                                    : "text-rose-600"
                              )}
                            >
                              {delivery.response_status}
                            </span>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </TD>
                        <TD align="right" className="tabular text-[12.5px]">
                          {delivery.duration_ms != null
                            ? formatDuration(delivery.duration_ms)
                            : "—"}
                        </TD>
                        <TD align="center" className="tabular">
                          {delivery.attempt}
                        </TD>
                        <TD>
                          <Tooltip content={formatDateTime(delivery.created_at)}>
                            <span className="text-[12.5px]">
                              {formatRelative(delivery.created_at)}
                            </span>
                          </Tooltip>
                        </TD>
                        <TD>
                          {permissions.webhooks && (
                            <Button
                              variant="ghost"
                              size="iconXs"
                              aria-label="Reenviar"
                              title="Reenviar"
                              loading={replaying === delivery.id}
                              onClick={async () => {
                                setReplaying(delivery.id);
                                await handle(replayDeliveryAction(delivery.id));
                                setReplaying(null);
                              }}
                            >
                              <RotateCcw />
                            </Button>
                          )}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
            <p className="mt-2 text-[12px] text-ink-400">
              Precisa inspecionar o corpo enviado e a resposta?{" "}
              <Link href="/webhooks" className="font-medium text-brand-600 hover:underline">
                Abra a tela de webhooks
              </Link>
              .
            </p>
          </div>
        </TabsContent>

        {/* ----------------------------------------------------- Settings */}
        <TabsContent value="settings" className="space-y-5">
          <Card>
            <CardHeader>
              <div className="space-y-0.5">
                <CardTitle>Dados do projeto</CardTitle>
                <p className="text-[12.5px] text-ink-500">
                  Nome, cliente, domínios, valores e tags.
                </p>
              </div>
              {permissions.write && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil />}
                  onClick={() => setProjectFormOpen(true)}
                >
                  Editar dados
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Código</span>
                <span className="font-mono text-[12px] text-ink-800">{project.code}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Identificador</span>
                <span className="font-mono text-[12px] text-ink-800">{project.slug}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Ambiente</span>
                <span className="font-medium text-ink-800">{project.environment}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Moeda</span>
                <span className="font-medium text-ink-800">{project.currency}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Valor mensal</span>
                <span className="font-medium tabular text-ink-800">
                  {formatCurrency(project.monthly_amount)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Valor de contrato</span>
                <span className="font-medium tabular text-ink-800">
                  {formatCurrency(project.contract_value)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="space-y-0.5">
                <CardTitle>Regras de acesso</CardTitle>
                <p className="text-[12.5px] text-ink-500">
                  Como o FlowDesk decide travar a aplicação por inadimplência.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-ink-200 px-3.5 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[13px] font-medium text-ink-800">Bloqueio automático</p>
                  <p className="text-xs leading-relaxed text-ink-500">
                    {project.block_mode === "AUTO"
                      ? "Cobranças obrigatórias vencidas além da carência bloqueiam o acesso sozinhas."
                      : "O acesso só muda por ação manual da equipe."}
                  </p>
                </div>
                <Switch
                  checked={project.block_mode === "AUTO"}
                  disabled={!permissions.block}
                  onCheckedChange={(checked) =>
                    void handle(toggleBlockModeAction(project.id, checked ? "AUTO" : "MANUAL"))
                  }
                  aria-label="Bloqueio automático"
                />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Field
                  label="Dias de carência"
                  htmlFor="grace-days"
                  hint="Prazo depois do vencimento antes do bloqueio"
                  className="w-full max-w-[220px]"
                >
                  <Input
                    id="grace-days"
                    type="number"
                    min={0}
                    max={90}
                    value={grace}
                    disabled={!permissions.block}
                    onChange={(event) => setGrace(event.target.value)}
                    suffix="dias"
                  />
                </Field>
                {permissions.block && grace !== String(project.grace_days) && (
                  <Button
                    variant="secondary"
                    icon={<CheckCircle2 />}
                    onClick={() =>
                      void handle(updateGraceDaysAction(project.id, Number(grace)))
                    }
                  >
                    Salvar carência
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {permissions.block && (
            <Card className="border-rose-200">
              <CardHeader className="border-rose-200/70">
                <div className="space-y-0.5">
                  <CardTitle className="text-rose-900">Zona de risco</CardTitle>
                  <p className="text-[12.5px] text-rose-700/80">
                    Estas ações afetam imediatamente a aplicação em produção.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-ink-200/70 p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-800">
                      {hasAccess ? "Bloquear acesso" : "Liberar acesso"}
                    </p>
                    <p className="text-[12px] text-ink-500">
                      {hasAccess
                        ? "A aplicação passa a receber has_access: false na próxima consulta."
                        : "Restabelece o acesso e dispara project.unblocked."}
                    </p>
                  </div>
                  {hasAccess ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Lock />}
                      onClick={() => void handle(blockProjectAction(project.id))}
                    >
                      Bloquear
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Unlock />}
                      onClick={() => void handle(unblockProjectAction(project.id))}
                    >
                      Liberar
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-800">Suspender projeto</p>
                    <p className="text-[12px] text-ink-500">
                      Trava por motivo não financeiro. A automação de cobrança deixa de mexer no
                      status.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PauseCircle />}
                    disabled={project.status === "SUSPENDED"}
                    onClick={() => {
                      setReason("");
                      setDanger("suspend");
                    }}
                  >
                    Suspender
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-800">Arquivar projeto</p>
                    <p className="text-[12px] text-ink-500">
                      Encerra o projeto, revoga todas as chaves e o remove das listagens.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Archive />}
                    disabled={project.status === "ARCHIVED" || !permissions.write}
                    onClick={() => setDanger("archive")}
                  >
                    Arquivar
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-800">Excluir projeto</p>
                    <p className="text-[12px] text-ink-500">
                      Remove permanentemente projetos de teste sem cobranças ou pagamentos
                      confirmados.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 />}
                    disabled={!permissions.write}
                    onClick={() => setDanger("delete")}
                  >
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------- Modais -- */}

      {keyFormOpen && (
        <ApiKeyFormModal
          key={editingKey?.id ?? "new-key"}
          open={keyFormOpen}
          onOpenChange={setKeyFormOpen}
          apiKey={editingKey}
          projects={projectOption}
          defaultProjectId={project.id}
          appUrl={appUrl}
        />
      )}

      <SecretRevealModal
        open={Boolean(issued)}
        onOpenChange={(next) => !next && setIssued(null)}
        issued={issued}
        appUrl={appUrl}
      />

      {hookFormOpen && (
        <WebhookFormModal
          key={editingHook?.id ?? "new-hook"}
          open={hookFormOpen}
          onOpenChange={setHookFormOpen}
          endpoint={editingHook}
          projects={[{ id: project.id, name: project.name }]}
          defaultProjectId={project.id}
        />
      )}

      {projectFormOpen && (
        <ProjectFormModal
          open={projectFormOpen}
          onOpenChange={setProjectFormOpen}
          project={project}
          customers={customers}
          companies={companies}
        />
      )}

      <ConfirmDialog
        open={Boolean(keyConfirm)}
        onOpenChange={(open) => !open && setKeyConfirm(null)}
        title={
          keyConfirm?.kind === "revoke"
            ? `Revogar ${keyConfirm.key.name}?`
            : `Rotacionar ${keyConfirm?.key.name}?`
        }
        description={
          keyConfirm?.kind === "revoke"
            ? "As requisições feitas com esta chave passam a receber 401 imediatamente."
            : "Um novo secret é gerado e exibido uma única vez. O atual para de funcionar na hora."
        }
        confirmLabel={keyConfirm?.kind === "revoke" ? "Revogar" : "Rotacionar"}
        destructive={keyConfirm?.kind === "revoke"}
        loading={busy}
        onConfirm={runKeyConfirm}
      />

      <ConfirmDialog
        open={Boolean(hookConfirm)}
        onOpenChange={(open) => !open && setHookConfirm(null)}
        title={
          hookConfirm?.kind === "delete" ? "Remover endpoint?" : "Rotacionar signing secret?"
        }
        description={
          hookConfirm?.kind === "delete"
            ? "O endpoint e o histórico de entregas são apagados."
            : "Atualize a verificação no servidor do cliente antes do próximo evento."
        }
        confirmLabel={hookConfirm?.kind === "delete" ? "Remover" : "Rotacionar"}
        destructive={hookConfirm?.kind === "delete"}
        loading={busy}
        onConfirm={runHookConfirm}
      />

      <ConfirmDialog
        open={Boolean(danger)}
        onOpenChange={(open) => !open && setDanger(null)}
        title={
          danger === "archive"
            ? `Arquivar ${project.name}?`
            : danger === "delete"
              ? `Excluir ${project.name}?`
              : `Suspender ${project.name}?`
        }
        description={
          danger === "archive"
            ? "O projeto sai das listagens e todas as credenciais ativas são revogadas. Só é possível arquivar sem cobranças em aberto."
            : danger === "delete"
              ? "A exclusão é permanente e só é permitida para projetos sem cobranças ou pagamentos confirmados."
              : undefined
        }
        confirmLabel={
          danger === "archive"
            ? "Arquivar projeto"
            : danger === "delete"
              ? "Excluir definitivamente"
              : "Suspender projeto"
        }
        destructive
        loading={busy}
        onConfirm={runDanger}
      >
        {danger === "suspend" ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-600">
              A suspensão trava o acesso por motivo não financeiro e faz a automação de cobrança
              parar de alterar o status deste projeto.
            </p>
            <Field label="Motivo" hint="Registrado na auditoria">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: contrato em renegociação"
                className="min-h-[70px]"
              />
            </Field>
          </div>
        ) : undefined}
      </ConfirmDialog>
    </>
  );
}
