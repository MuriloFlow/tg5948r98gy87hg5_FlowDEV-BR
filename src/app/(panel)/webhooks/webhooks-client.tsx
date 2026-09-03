"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, SidePanel } from "@/components/ui/modal";
import { CodeBlock, CopyButton, EmptyState, Switch, Tooltip } from "@/components/ui/misc";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar } from "@/components/panel/toolbar";
import { WebhookFormModal, type WebhookProjectOption } from "./webhook-form";
import {
  deleteWebhookEndpointAction,
  replayDeliveryAction,
  rotateWebhookSecretAction,
  sendTestEventAction,
  toggleWebhookEndpointAction,
} from "@/server/webhook-endpoints";
import { DELIVERY_STATUS, eventLabel } from "@/lib/labels";
import { formatDateTime, formatDuration, formatNumber, formatRelative } from "@/lib/format";
import type { DeliveryStatus, WebhookEndpoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EndpointRow extends WebhookEndpoint {
  project_name: string;
}

export interface DeliveryRow {
  id: string;
  endpoint_id: string;
  endpoint_url: string;
  event_id: string;
  event_type: string;
  attempt: number;
  status: DeliveryStatus;
  request_url: string;
  request_body: string | null;
  request_headers: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
  delivered_at: string | null;
}

function deliveryMeta(status: DeliveryStatus) {
  return DELIVERY_STATUS[status] ?? { label: status, tone: "neutral" as const };
}

function prettyJson(value: string | null): string {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

const VERIFY_SNIPPET = [
  'import crypto from "node:crypto";',
  "",
  "// Header: X-FlowDesk-Signature: t=<unix>,v1=<hex>",
  "// Payload assinado: `${t}.${rawBody}` — use o corpo BRUTO, sem reserializar o JSON.",
  "export function verificarAssinatura(",
  "  rawBody: string,",
  "  header: string,",
  "  secret: string,",
  "): boolean {",
  "  const partes = Object.fromEntries(",
  '    header.split(",").map((parte) => {',
  '      const [chave, ...resto] = parte.trim().split("=");',
  '      return [chave, resto.join("=")];',
  "    }),",
  "  ) as { t?: string; v1?: string };",
  "",
  "  if (!partes.t || !partes.v1) return false;",
  "",
  "  // rejeita replays: tolerância de 5 minutos",
  "  if (Math.abs(Date.now() / 1000 - Number(partes.t)) > 300) return false;",
  "",
  "  const esperado = crypto",
  '    .createHmac("sha256", secret)',
  "    .update(`${partes.t}.${rawBody}`)",
  '    .digest("hex");',
  "",
  "  return crypto.timingSafeEqual(",
  "    Buffer.from(esperado),",
  "    Buffer.from(partes.v1),",
  "  );",
  "}",
].join("\n");

const ROUTE_SNIPPET = [
  "// app/api/webhooks/flowdesk/route.ts",
  "export async function POST(request: Request) {",
  "  const rawBody = await request.text();",
  '  const assinatura = request.headers.get("X-FlowDesk-Signature") ?? "";',
  "",
  "  if (!verificarAssinatura(rawBody, assinatura, process.env.FLOWDESK_WEBHOOK_SECRET!)) {",
  '    return new Response("assinatura inválida", { status: 401 });',
  "  }",
  "",
  "  const evento = JSON.parse(rawBody);",
  '  // evento.type: "payment.paid", "project.blocked", ...',
  "",
  "  // responda 2xx rápido; processe o resto em background",
  '  return new Response("ok", { status: 200 });',
  "}",
].join("\n");

export function WebhooksClient({
  endpoints,
  deliveries,
  projects,
  canManage,
  defaultProjectId,
}: {
  endpoints: EndpointRow[];
  deliveries: DeliveryRow[];
  projects: WebhookProjectOption[];
  canManage: boolean;
  defaultProjectId?: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WebhookEndpoint | null>(null);
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = React.useState<{
    kind: "delete" | "rotate";
    endpoint: EndpointRow;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [detail, setDetail] = React.useState<DeliveryRow | null>(null);
  const [replaying, setReplaying] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  async function toggleEndpoint(endpoint: EndpointRow, enabled: boolean) {
    const result = await toggleWebhookEndpointAction(endpoint.id, enabled);
    if (result.ok) {
      toast.success(result.message ?? "Atualizado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível atualizar");
    }
  }

  async function sendTest(endpoint: EndpointRow) {
    setTesting(endpoint.id);
    const result = await sendTestEventAction(endpoint.project_id);
    setTesting(null);
    if (result.ok) toast.success(result.message ?? "Evento enviado");
    else toast.error(result.error ?? "Falha ao enviar o evento de teste");
    router.refresh();
  }

  async function replay(delivery: DeliveryRow) {
    setReplaying(delivery.id);
    const result = await replayDeliveryAction(delivery.id);
    setReplaying(null);
    if (result.ok) toast.success(result.message ?? "Evento reenviado");
    else toast.error(result.error ?? "Falha no reenvio");
    router.refresh();
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    const result =
      confirm.kind === "delete"
        ? await deleteWebhookEndpointAction(confirm.endpoint.id)
        : await rotateWebhookSecretAction(confirm.endpoint.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      if (confirm.kind === "rotate") {
        setRevealed((current) => ({ ...current, [confirm.endpoint.id]: true }));
      }
      setConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível concluir");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por URL do endpoint..."
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
              { value: "ACTIVE", label: "Ativo" },
              { value: "DISABLED", label: "Desativado" },
            ],
          },
        ]}
        right={
          canManage && (
            <Button size="sm" onClick={openCreate} icon={<Plus />}>
              Novo endpoint
            </Button>
          )
        }
      />

      <div className="space-y-6">
        {endpoints.length === 0 ? (
          <EmptyState
            icon={<WebhookIcon />}
            title="Nenhum endpoint configurado"
            description="Cadastre a URL da aplicação do cliente para receber eventos de pagamento e bloqueio em tempo real."
            action={
              canManage && (
                <Button size="sm" onClick={openCreate} icon={<Plus />}>
                  Criar endpoint
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {endpoints.map((endpoint) => {
              const isRevealed = revealed[endpoint.id];
              const failing = endpoint.consecutive_failures > 0;

              return (
                <Card key={endpoint.id}>
                  <CardHeader className="items-start">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all font-mono text-[13px] font-medium text-ink-900">
                          {endpoint.url}
                        </code>
                        <CopyButton value={endpoint.url} label="Copiar URL" />
                        <Badge
                          tone={endpoint.status === "ACTIVE" ? "success" : "neutral"}
                          size="sm"
                          dot
                        >
                          {endpoint.status === "ACTIVE" ? "Ativo" : "Desativado"}
                        </Badge>
                        {failing && (
                          <Badge tone="danger" size="sm">
                            {endpoint.consecutive_failures} falha
                            {endpoint.consecutive_failures > 1 ? "s" : ""} seguida
                            {endpoint.consecutive_failures > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[12.5px] text-ink-500">
                        <Link
                          href={`/projetos/${endpoint.project_id}`}
                          className="font-medium text-ink-600 hover:text-brand-600"
                        >
                          {endpoint.project_name}
                        </Link>
                        {endpoint.description ? ` · ${endpoint.description}` : ""}
                        {" · "}
                        {formatNumber(Number(endpoint.total_deliveries))} entregas
                        {endpoint.last_success_at
                          ? ` · último sucesso ${formatRelative(endpoint.last_success_at)}`
                          : " · nenhuma entrega bem-sucedida"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canManage && (
                        <Tooltip
                          content={
                            endpoint.status === "ACTIVE"
                              ? "Desativar entregas"
                              : "Reativar entregas"
                          }
                        >
                          <span>
                            <Switch
                              checked={endpoint.status === "ACTIVE"}
                              onCheckedChange={(checked) => void toggleEndpoint(endpoint, checked)}
                              aria-label="Ativar endpoint"
                            />
                          </span>
                        </Tooltip>
                      )}
                      {canManage && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="iconXs" aria-label="Ações">
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem
                              icon={<Send />}
                              onSelect={() => void sendTest(endpoint)}
                              disabled={testing === endpoint.id}
                            >
                              Enviar evento de teste
                            </MenuItem>
                            <MenuItem
                              icon={<Pencil />}
                              onSelect={() => {
                                setEditing(endpoint);
                                setFormOpen(true);
                              }}
                            >
                              Editar endpoint
                            </MenuItem>
                            <MenuItem
                              icon={<RefreshCcw />}
                              onSelect={() => setConfirm({ kind: "rotate", endpoint })}
                            >
                              Rotacionar secret
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                              icon={<Trash2 />}
                              destructive
                              onSelect={() => setConfirm({ kind: "delete", endpoint })}
                            >
                              Remover endpoint
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3.5">
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
                        {isRevealed
                          ? endpoint.secret
                          : `${endpoint.secret.slice(0, 11)}${"•".repeat(24)}`}
                      </code>
                      <Button
                        variant="ghost"
                        size="iconXs"
                        aria-label={isRevealed ? "Ocultar secret" : "Revelar secret"}
                        onClick={() =>
                          setRevealed((current) => ({
                            ...current,
                            [endpoint.id]: !current[endpoint.id],
                          }))
                        }
                      >
                        {isRevealed ? <EyeOff /> : <Eye />}
                      </Button>
                      <CopyButton value={endpoint.secret} label="Copiar secret" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold tracking-[-0.015em] text-ink-900">
                Entregas recentes
              </h2>
              <p className="text-[13px] text-ink-500">
                Cada tentativa registra corpo, resposta e duração. Reenvie manualmente quando
                precisar.
              </p>
            </div>
          </div>

          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Evento</TH>
                  <TH>Endpoint</TH>
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
                    colSpan={8}
                    icon={<Send />}
                    title="Nenhuma entrega registrada"
                    description="Assim que um evento for emitido, cada tentativa de entrega aparece aqui com o corpo e a resposta completos."
                  />
                ) : (
                  deliveries.map((delivery) => (
                    <TR key={delivery.id} clickable onClick={() => setDetail(delivery)}>
                      <TD>
                        <span className="block font-mono text-[12px] font-medium text-ink-900">
                          {delivery.event_type}
                        </span>
                        <span className="block text-[11.5px] text-ink-400">
                          {eventLabel(delivery.event_type)}
                        </span>
                      </TD>
                      <TD className="max-w-[220px]">
                        <span className="block truncate font-mono text-[11.5px] text-ink-500">
                          {delivery.endpoint_url}
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
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label="Reenviar"
                            title="Reenviar"
                            loading={replaying === delivery.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void replay(delivery);
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
        </div>

        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Verificação da assinatura</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                Toda requisição leva o header{" "}
                <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11.5px]">
                  X-FlowDesk-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;
                </code>
                . O conteúdo assinado é{" "}
                <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11.5px]">
                  {"`${t}.${rawBody}`"}
                </code>{" "}
                com HMAC-SHA256 usando o signing secret do endpoint.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CodeBlock code={VERIFY_SNIPPET} filename="lib/flowdesk-webhook.ts" />
            <CodeBlock code={ROUTE_SNIPPET} filename="route.ts" />
            <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-600">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                Leia o corpo como texto bruto antes de fazer parse — reserializar o JSON quebra a
                assinatura.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                Responda 2xx em até 10 segundos. Timeout conta como falha e entra na fila de
                retentativa (1min, 5min, 30min, 2h, 6h, 24h).
              </li>
              <li className="flex gap-2">
                <Ban className="mt-0.5 size-3.5 shrink-0 text-rose-500" />
                Após 25 falhas consecutivas o endpoint é desativado automaticamente.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {formOpen && (
        <WebhookFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          endpoint={editing}
          projects={projects}
          defaultProjectId={defaultProjectId}
        />
      )}

      <SidePanel
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detail ? detail.event_type : "Entrega"}
        description={detail ? `Tentativa ${detail.attempt} · ${formatDateTime(detail.created_at)}` : undefined}
        width="max-w-2xl"
        footer={
          detail && canManage ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              loading={replaying === detail.id}
              onClick={() => void replay(detail)}
            >
              Reenviar evento
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-ink-200 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge meta={deliveryMeta(detail.status)} size="sm" />
                </div>
              </div>
              <div className="rounded-lg border border-ink-200 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  Resposta HTTP
                </p>
                <p className="mt-1 font-mono text-[13px] font-semibold text-ink-900">
                  {detail.response_status ?? "sem resposta"}
                  {detail.duration_ms != null && (
                    <span className="ml-2 text-[11.5px] font-normal text-ink-400">
                      {formatDuration(detail.duration_ms)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-ink-700">Destino</p>
              <code className="block break-all rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 font-mono text-[12px] text-ink-700">
                POST {detail.request_url}
              </code>
            </div>

            {detail.error_message && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12.5px] text-rose-700">
                {detail.error_message}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-ink-700">Headers enviados</p>
              <CodeBlock
                code={JSON.stringify(detail.request_headers ?? {}, null, 2)}
                filename="request headers"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-ink-700">Corpo enviado</p>
              <CodeBlock code={prettyJson(detail.request_body)} filename="request body" />
            </div>

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-ink-700">Resposta recebida</p>
              <CodeBlock code={prettyJson(detail.response_body)} filename="response body" />
            </div>
          </div>
        )}
      </SidePanel>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "delete"
            ? "Remover este endpoint?"
            : "Rotacionar o signing secret?"
        }
        description={
          confirm?.kind === "delete"
            ? "O endpoint e todo o histórico de entregas são apagados. A aplicação para de receber eventos imediatamente."
            : "Um novo secret é gerado agora. Atualize a verificação no servidor do cliente antes do próximo evento."
        }
        confirmLabel={confirm?.kind === "delete" ? "Remover endpoint" : "Rotacionar secret"}
        destructive={confirm?.kind === "delete"}
        loading={busy}
        onConfirm={runConfirm}
      />
    </>
  );
}
