"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Lock, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { CodeBlock, Switch, Tooltip } from "@/components/ui/misc";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar } from "@/components/panel/toolbar";
import {
  blockProjectAction,
  toggleBlockModeAction,
  unblockProjectAction,
  updateGraceDaysAction,
} from "@/server/projects";
import { projectStatusMeta } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProjectEntitlement } from "@/lib/types";

function GraceDaysCell({
  projectId,
  value,
  disabled,
}: {
  projectId: string;
  value: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = React.useState(String(value));
  const [saving, setSaving] = React.useState(false);

  const dirty = days !== String(value);

  async function save() {
    if (!dirty) return;
    setSaving(true);
    const result = await updateGraceDaysAction(projectId, Number(days));
    setSaving(false);
    if (result.ok) {
      toast.success(result.message ?? "Carência atualizada");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível salvar");
      setDays(String(value));
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        min={0}
        max={90}
        value={days}
        disabled={disabled || saving}
        onChange={(event) => setDays(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void save()}
        className="h-7 w-16 px-2 text-right text-[12.5px] tabular"
        aria-label="Dias de carência"
      />
      {dirty && (
        <Button
          variant="ghost"
          size="iconXs"
          aria-label="Salvar carência"
          loading={saving}
          onClick={() => void save()}
        >
          <Check className="text-emerald-600" />
        </Button>
      )}
    </div>
  );
}

export function AccessClient({
  rows,
  appUrl,
  canBlock,
}: {
  rows: ProjectEntitlement[];
  appUrl: string;
  canBlock: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<ProjectEntitlement | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function block() {
    if (!confirm) return;
    setBusy(true);
    const result = await blockProjectAction(confirm.project_id, reason);
    setBusy(false);
    if (result.ok) {
      toast.success(result.message ?? "Acesso bloqueado");
      setConfirm(null);
      setReason("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível bloquear");
    }
  }

  async function unblock(row: ProjectEntitlement) {
    const result = await unblockProjectAction(row.project_id);
    if (result.ok) {
      toast.success(result.message ?? "Acesso liberado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível liberar");
    }
  }

  async function toggleMode(row: ProjectEntitlement, auto: boolean) {
    const result = await toggleBlockModeAction(row.project_id, auto ? "AUTO" : "MANUAL");
    if (result.ok) {
      toast.success(result.message ?? "Modo atualizado");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível atualizar o modo");
    }
  }

  const responseSnippet = JSON.stringify(
    {
      status: "BLOCKED_PAYMENT",
      has_access: false,
      blocked: true,
      invoice: {
        id: "b3f1c0d2-8a4e-4f1b-9c22-6e0d5a7f1234",
        code: "INV-2026-000148",
        description: "Mensalidade Setembro/2026",
        total: 1290,
        due_date: "2026-09-05",
        days_overdue: 12,
      },
      checkout_url: `${appUrl}/pay/8Kd2mQx7Rt9v`,
    },
    null,
    2
  );

  const requestSnippet = [
    `curl -s "${appUrl}/api/v1/entitlement" \\`,
    `  -H "Authorization: Bearer $FLOWDESK_API_KEY"`,
  ].join("\n");

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por projeto, código ou cliente..."
        filters={[
          {
            key: "acesso",
            label: "Acesso",
            options: [
              { value: "liberado", label: "Liberado" },
              { value: "bloqueado", label: "Bloqueado" },
            ],
            allLabel: "Todos",
          },
          {
            key: "modo",
            label: "Modo de bloqueio",
            options: [
              { value: "AUTO", label: "Automático" },
              { value: "MANUAL", label: "Manual" },
            ],
            allLabel: "Todos",
          },
        ]}
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Projeto</TH>
              <TH>Acesso</TH>
              <TH>Cobrança bloqueadora</TH>
              <TH align="right">Em aberto</TH>
              <TH align="center">Bloqueio auto</TH>
              <TH align="right">Carência</TH>
              <TH className="w-[150px]" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<ShieldCheck />}
                title="Nenhum projeto para controlar"
                description="Assim que existirem projetos cadastrados, o estado de acesso de cada aplicação integrada aparece aqui."
              />
            ) : (
              rows.map((row) => (
                <TR key={row.project_id}>
                  <TD>
                    <Link href={`/projetos/${row.project_id}`} className="group block">
                      <span className="block font-medium text-ink-900 group-hover:text-brand-600">
                        {row.project_name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-400">
                        {row.project_code} · {row.customer_name}
                        {row.primary_domain ? ` · ${row.primary_domain}` : ""}
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge meta={projectStatusMeta(row.status)} size="sm" />
                      <span
                        className={
                          row.has_access
                            ? "text-[11px] font-medium text-emerald-600"
                            : "text-[11px] font-medium text-rose-600"
                        }
                      >
                        has_access: {String(row.has_access)}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    {row.blocking_invoice_id ? (
                      <Link
                        href={`/cobrancas/${row.blocking_invoice_id}`}
                        className="block hover:text-brand-600"
                      >
                        <span className="block font-mono text-[11.5px] text-ink-600">
                          {row.blocking_invoice_code}
                        </span>
                        <span className="block text-[11.5px] text-ink-400">
                          {formatCurrency(row.blocking_invoice_total)} · vence{" "}
                          {formatDate(row.blocking_invoice_due_date)}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-ink-300">Nenhuma pendência</span>
                    )}
                  </TD>
                  <TD align="right" className="tabular">
                    {Number(row.open_amount) > 0 ? (
                      <>
                        <span className="font-semibold text-amber-700">
                          {formatCurrency(row.open_amount)}
                        </span>
                        <span className="block text-[11px] text-ink-400">
                          {row.open_invoices} cobrança{Number(row.open_invoices) === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD align="center">
                    <Tooltip
                      content={
                        row.block_mode === "AUTO"
                          ? "Bloqueia sozinho após a carência"
                          : "Somente bloqueio manual"
                      }
                    >
                      <span className="inline-flex">
                        <Switch
                          checked={row.block_mode === "AUTO"}
                          disabled={!canBlock}
                          onCheckedChange={(checked) => void toggleMode(row, checked)}
                          aria-label="Bloqueio automático"
                        />
                      </span>
                    </Tooltip>
                  </TD>
                  <TD align="right">
                    <GraceDaysCell
                      projectId={row.project_id}
                      value={Number(row.grace_days ?? 0)}
                      disabled={!canBlock}
                    />
                  </TD>
                  <TD align="right">
                    {canBlock &&
                      (row.has_access ? (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={<Lock />}
                          onClick={() => {
                            setReason("");
                            setConfirm(row);
                          }}
                        >
                          Bloquear
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={<Unlock />}
                          onClick={() => void unblock(row)}
                        >
                          Liberar
                        </Button>
                      ))}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>

      <Card className="mt-6">
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Contrato de entitlement</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              É este endpoint que as aplicações integradas consultam para saber se devem liberar ou
              travar o próprio acesso.
            </p>
          </div>
          <Badge tone="violet" size="sm" className="font-mono">
            GET /api/v1/entitlement
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-ink-700">Requisição</p>
            <CodeBlock code={requestSnippet} filename="terminal" />
            <p className="text-[12.5px] leading-relaxed text-ink-500">
              A chave secreta identifica o projeto — não é preciso enviar o id. Consulte no boot da
              aplicação e a cada poucos minutos, ou reaja ao webhook{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11.5px]">
                project.blocked
              </code>
              .
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-ink-700">Resposta</p>
            <CodeBlock code={responseSnippet} filename="200 OK" />
            <p className="text-[12.5px] leading-relaxed text-ink-500">
              Quando <code className="font-mono text-[11.5px]">has_access</code> for{" "}
              <code className="font-mono text-[11.5px]">false</code>, mostre a tela de bloqueio com
              o valor devido e envie o usuário para{" "}
              <code className="font-mono text-[11.5px]">checkout_url</code>. O acesso volta sozinho
              assim que o pagamento é confirmado.
            </p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Bloquear ${confirm.project_name}?` : "Bloquear projeto"}
        confirmLabel="Bloquear acesso"
        destructive
        loading={busy}
        onConfirm={block}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-800">
            <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
            <span>
              A aplicação passa a receber <span className="font-mono">has_access: false</span> na
              próxima consulta e um evento{" "}
              <span className="font-mono">project.blocked</span> é enviado aos webhooks ativos.
            </span>
          </div>
          <Field label="Motivo" hint="Registrado na auditoria e exibido no histórico do projeto">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex.: contrato encerrado / inadimplência acima de 30 dias"
              className="min-h-[70px]"
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}
