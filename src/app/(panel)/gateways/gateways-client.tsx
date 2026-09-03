"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CircleCheck,
  CircleX,
  ExternalLink,
  KeyRound,
  Landmark,
  Lock,
  PlugZap,
  RefreshCw,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, CopyButton } from "@/components/ui/misc";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { reprocessGatewayWebhookAction, testGatewayAction } from "@/server/settings";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface GatewayWebhookRow {
  id: string;
  provider: string;
  event_type: string | null;
  external_id: string | null;
  signature_valid: boolean | null;
  processed: boolean;
  processed_at: string | null;
  process_error: string | null;
  created_at: string;
}

const GO_LIVE_STEPS = [
  {
    title: "Gere as credenciais de produção",
    detail:
      "No painel do Mercado Pago, acesse Suas integrações → sua aplicação → Credenciais de produção.",
  },
  {
    title: "Defina as variáveis de ambiente",
    detail:
      "MERCADOPAGO_ACCESS_TOKEN, NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY e MERCADOPAGO_WEBHOOK_SECRET no ambiente da aplicação.",
  },
  {
    title: "Cadastre a URL de webhook",
    detail:
      "Em Suas integrações → Webhooks, registre a URL abaixo e assine os eventos de Pagamentos (payment) e Ordens comerciais (merchant_order).",
  },
  {
    title: "Teste a conexão",
    detail: "Use o botão “Testar conexão” — ele consulta /users/me com o token configurado.",
  },
  {
    title: "Faça um pagamento real de baixo valor",
    detail:
      "Emita um payment link de R$ 1,00, pague por Pix e confira se a cobrança foi quitada automaticamente.",
  },
  {
    title: "Confirme o recebimento dos webhooks",
    detail:
      "A notificação deve aparecer na tabela abaixo com assinatura válida e status processado.",
  },
];

export function GatewaysClient({
  appUrl,
  tokenConfigured,
  webhookSecretConfigured,
  publicKeyConfigured,
  connection,
  webhooks,
  counts,
}: {
  appUrl: string;
  tokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  publicKeyConfigured: boolean;
  connection: { ok: boolean; message: string };
  webhooks: GatewayWebhookRow[];
  counts: { total: number; pending: number; invalid: number };
}) {
  const router = useRouter();
  const [testing, setTesting] = React.useState(false);
  const [reprocessing, setReprocessing] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const webhookUrl = `${appUrl}/api/webhooks/mercadopago`;
  const status = result ?? connection;

  async function testConnection() {
    setTesting(true);
    const response = await testGatewayAction();
    setTesting(false);

    if (response.ok && response.data) {
      setResult({ ok: response.data.connected, message: response.data.message });
      if (response.data.connected) toast.success(response.data.message);
      else toast.error(response.data.message);
      router.refresh();
    } else {
      setResult({ ok: false, message: response.error ?? "Falha ao testar a conexão." });
      toast.error(response.error ?? "Falha ao testar a conexão");
    }
  }

  async function reprocess(id: string) {
    setReprocessing(id);
    const response = await reprocessGatewayWebhookAction(id);
    setReprocessing(null);

    if (response.ok) {
      toast.success(response.message ?? "Webhook reprocessado");
      router.refresh();
    } else {
      toast.error(response.error ?? "Não foi possível reprocessar");
    }
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ status da conexão */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg",
                status.ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}
            >
              <Landmark className="size-4.5" />
            </span>
            <div className="space-y-0.5">
              <CardTitle>Mercado Pago</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                Provedor de Pix, cartão e boleto usado nas cobranças
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void testConnection()}
            loading={testing}
            icon={<PlugZap />}
          >
            Testar conexão
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3.5",
              status.ok ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"
            )}
          >
            {status.ok ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0 space-y-0.5">
              <p
                className={cn(
                  "text-[13.5px] font-semibold",
                  status.ok ? "text-emerald-900" : "text-rose-900"
                )}
              >
                {status.ok ? "Conectado" : "Erro de conexão"}
              </p>
              <p
                className={cn(
                  "text-[12.5px] leading-relaxed",
                  status.ok ? "text-emerald-700/90" : "text-rose-700/90"
                )}
              >
                {status.message}
              </p>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <EnvStatus
              label="Access Token"
              variable="MERCADOPAGO_ACCESS_TOKEN"
              configured={tokenConfigured}
              required
            />
            <EnvStatus
              label="Segredo do webhook"
              variable="MERCADOPAGO_WEBHOOK_SECRET"
              configured={webhookSecretConfigured}
              required
            />
            <EnvStatus
              label="Public Key"
              variable="NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"
              configured={publicKeyConfigured}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-400" />
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              Os segredos <strong>não ficam no banco de dados</strong>: eles vivem apenas nas
              variáveis de ambiente <Code>MERCADOPAGO_ACCESS_TOKEN</Code> e{" "}
              <Code>MERCADOPAGO_WEBHOOK_SECRET</Code>. Para trocar as credenciais, atualize o
              ambiente e reinicie a aplicação — nada é gravado aqui.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ instruções */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Onde encontrar as credenciais</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                Você precisa de uma aplicação criada no painel do Mercado Pago
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <Instruction
              icon={<KeyRound />}
              title="Access Token"
              body="Painel do Mercado Pago → Suas integrações → selecione a aplicação → Credenciais de produção → Access Token. Comece pelas credenciais de teste se ainda estiver validando o fluxo."
            />
            <Instruction
              icon={<Webhook />}
              title="Chave secreta do webhook"
              body="Na mesma aplicação, abra Webhooks → Configurar notificações. A “Chave secreta” exibida ali é usada para validar a assinatura x-signature de cada notificação."
            />
            <Button variant="secondary" size="sm" asChild>
              <a
                href="https://www.mercadopago.com.br/developers/panel/app"
                target="_blank"
                rel="noreferrer noopener"
              >
                Abrir painel do Mercado Pago
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>URL de webhook para cadastrar</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                Cole exatamente esta URL no painel do Mercado Pago
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
              <code className="flex-1 select-all break-all font-mono text-[12.5px] text-ink-900">
                {webhookUrl}
              </code>
              <CopyButton value={webhookUrl} variant="secondary" size="iconSm" />
            </div>

            <ul className="space-y-2">
              {[
                "Evento “Pagamentos” (payment) — obrigatório para quitar cobranças automaticamente.",
                "Evento “Ordens comerciais” (merchant_order) — garante a conciliação de tentativas múltiplas.",
                "Modo de produção quando estiver usando o Access Token de produção.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] text-ink-600">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-[12px] leading-relaxed text-ink-500">
              A URL é derivada de <Code>NEXT_PUBLIC_APP_URL</Code>. Em produção, confirme que ela
              aponta para o domínio público — o Mercado Pago não entrega notificações em
              <Code>localhost</Code>.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------- checklist */}
      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Checklist para entrar em produção</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              Siga na ordem — cada etapa depende da anterior
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3.5">
            {GO_LIVE_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11.5px] font-semibold text-brand-600">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[13px] font-medium text-ink-900">{step.title}</p>
                  <p className="text-[12.5px] leading-relaxed text-ink-500">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ------------------------------------------- webhooks recebidos */}
      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Notificações recebidas do gateway</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              {formatNumber(counts.total)} no total · {formatNumber(counts.pending)} não processadas
              {counts.invalid > 0
                ? ` · ${formatNumber(counts.invalid)} com assinatura inválida`
                : ""}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH>Evento</TH>
                  <TH>ID no gateway</TH>
                  <TH align="center">Assinatura</TH>
                  <TH align="center">Processado</TH>
                  <TH>Recebido</TH>
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {webhooks.length === 0 ? (
                  <TableEmpty
                    colSpan={6}
                    icon={<Webhook />}
                    title="Nenhuma notificação recebida"
                    description="Depois de cadastrar a URL de webhook e receber o primeiro pagamento, as notificações aparecem aqui."
                  />
                ) : (
                  webhooks.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <span className="block font-medium text-ink-900">
                          {row.event_type ?? "—"}
                        </span>
                        <span className="block text-[11px] text-ink-400">{row.provider}</span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[12px] text-ink-700">
                          {row.external_id ?? "—"}
                        </span>
                      </TD>
                      <TD align="center">
                        {row.signature_valid === null ? (
                          <Badge tone="neutral" size="sm">
                            não verificada
                          </Badge>
                        ) : row.signature_valid ? (
                          <Badge tone="success" size="sm" dot>
                            válida
                          </Badge>
                        ) : (
                          <Badge tone="danger" size="sm" dot>
                            inválida
                          </Badge>
                        )}
                      </TD>
                      <TD align="center">
                        {row.processed ? (
                          <Badge tone="success" size="sm" dot>
                            sim
                          </Badge>
                        ) : (
                          <Badge tone="warning" size="sm" dot>
                            pendente
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <span className="block text-[12.5px] text-ink-700">
                          {formatDateTime(row.created_at)}
                        </span>
                        <span className="block text-[11px] text-ink-400">
                          {formatRelative(row.created_at)}
                        </span>
                        {row.process_error && (
                          <span className="mt-1 flex items-start gap-1 text-[11px] text-rose-600">
                            <AlertTriangle className="mt-px size-3 shrink-0" />
                            {row.process_error}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<RefreshCw />}
                          loading={reprocessing === row.id}
                          disabled={!row.external_id}
                          onClick={() => void reprocess(row.id)}
                        >
                          Reprocessar
                        </Button>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  );
}

function EnvStatus({
  label,
  variable,
  configured,
  required,
}: {
  label: string;
  variable: string;
  configured: boolean;
  required?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-lg border px-3 py-2.5",
        configured ? "border-ink-200 bg-white" : required ? "border-amber-200 bg-amber-50/60" : "border-ink-200 bg-ink-50/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink-800">{label}</p>
        {configured ? (
          <Badge tone="success" size="sm" dot>
            definido
          </Badge>
        ) : (
          <Badge tone={required ? "warning" : "neutral"} size="sm" dot>
            ausente
          </Badge>
        )}
      </div>
      <p className="truncate font-mono text-[11px] text-ink-400">{variable}</p>
    </div>
  );
}

function Instruction({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[13px] font-medium text-ink-900">{title}</p>
        <p className="text-[12.5px] leading-relaxed text-ink-500">{body}</p>
      </div>
    </div>
  );
}
