"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  Mail,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Switch } from "@/components/ui/misc";
import { deleteTemplateAction, saveTemplateAction } from "@/server/settings";
import type { ActionResult } from "@/server/action-utils";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TemplateRow {
  id: string;
  key: string;
  channel: string;
  name: string;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CHANNELS = [
  { value: "email", label: "E-mail", icon: Mail },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "sms", label: "SMS", icon: Smartphone },
] as const;

/** Variáveis suportadas e o valor de exemplo usado na pré-visualização. */
const SAMPLE_VALUES: Record<string, string> = {
  cliente: "Mecânica Total Flex",
  valor: "R$ 1.250,00",
  vencimento: "10/09/2026",
  link_pagamento: "https://flowdesk.app/pay/9f3a7c21",
  projeto: "App Oficina",
  empresa: "FlowDesk Tecnologia",
  codigo: "INV-2026-000123",
  dias_atraso: "5",
};

const VARIABLE_HINTS = Object.keys(SAMPLE_VALUES);

function channelMeta(channel: string) {
  return CHANNELS.find((item) => item.value === channel) ?? CHANNELS[0];
}

/** Substitui `{{variavel}}` pelos valores de exemplo. */
function renderPreview(text: string): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, name: string) => {
    const key = name.toLowerCase();
    return SAMPLE_VALUES[key] ?? match;
  });
}

export function TemplatesClient({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TemplateRow | null>(null);
  const [preview, setPreview] = React.useState<TemplateRow | null>(null);
  const [confirm, setConfirm] = React.useState<TemplateRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(template: TemplateRow) {
    setEditing(template);
    setEditorOpen(true);
  }

  async function runDelete() {
    if (!confirm) return;
    setBusy(true);
    const result = await deleteTemplateAction(confirm.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Modelo excluído");
      setConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível excluir");
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-500">
          Use variáveis como <code className="rounded bg-ink-100 px-1 font-mono text-[11.5px]">{"{{cliente}}"}</code>{" "}
          e <code className="rounded bg-ink-100 px-1 font-mono text-[11.5px]">{"{{valor}}"}</code> — elas
          são trocadas pelos dados reais no envio.
        </p>
        <Button size="sm" icon={<Plus />} onClick={openCreate}>
          Novo modelo
        </Button>
      </div>

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Modelo</TH>
              <TH>Canal</TH>
              <TH>Assunto</TH>
              <TH>Variáveis</TH>
              <TH align="center">Ativo</TH>
              <TH>Atualizado</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {templates.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<MessageSquareText />}
                title="Nenhum modelo cadastrado"
                description="Crie modelos para padronizar o aviso de vencimento, a cobrança em atraso e a confirmação de pagamento."
                action={
                  <Button size="sm" icon={<Plus />} onClick={openCreate}>
                    Criar primeiro modelo
                  </Button>
                }
              />
            ) : (
              templates.map((template) => {
                const meta = channelMeta(template.channel);
                const Icon = meta.icon;

                return (
                  <TR key={template.id}>
                    <TD>
                      <span className="block font-medium text-ink-900">{template.name}</span>
                      <span className="block font-mono text-[11px] text-ink-400">
                        {template.key}
                      </span>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-700">
                        <Icon className="size-3.5 text-ink-400" />
                        {meta.label}
                      </span>
                    </TD>
                    <TD>
                      <span className="block max-w-[240px] truncate text-[12.5px]">
                        {template.subject ?? <span className="text-ink-300">—</span>}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {template.variables.length === 0 ? (
                          <span className="text-ink-300">—</span>
                        ) : (
                          template.variables.slice(0, 4).map((variable) => (
                            <Badge key={variable} tone="neutral" size="sm">
                              <span className="font-mono text-[10px]">{variable}</span>
                            </Badge>
                          ))
                        )}
                        {template.variables.length > 4 && (
                          <Badge tone="neutral" size="sm">
                            +{template.variables.length - 4}
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD align="center">
                      <Badge tone={template.is_active ? "success" : "neutral"} size="sm" dot>
                        {template.is_active ? "ativo" : "inativo"}
                      </Badge>
                    </TD>
                    <TD>
                      <span className="text-[12px] text-ink-500">
                        {formatDateTime(template.updated_at)}
                      </span>
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="iconXs" aria-label="Ações do modelo">
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={<Eye />} onSelect={() => setPreview(template)}>
                            Pré-visualizar
                          </MenuItem>
                          <MenuItem icon={<Pencil />} onSelect={() => openEdit(template)}>
                            Editar
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            icon={<Trash2 />}
                            destructive
                            onSelect={() => setConfirm(template)}
                          >
                            Excluir
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </TableWrap>

      {editorOpen && (
        <TemplateEditor
          key={editing?.id ?? "new"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          template={editing}
        />
      )}

      <Modal
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
        title={preview ? `Pré-visualização — ${preview.name}` : ""}
        description="Valores de exemplo substituem as variáveis do modelo."
        size="md"
        icon={<Eye />}
      >
        {preview && (
          <PreviewPanel
            channel={preview.channel}
            subject={preview.subject ?? ""}
            body={preview.body}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Excluir “${confirm.name}”?` : ""}
        description="O modelo deixa de estar disponível para novos envios. Mensagens já enviadas não são afetadas."
        confirmLabel="Excluir modelo"
        destructive
        loading={busy}
        onConfirm={runDelete}
      />
    </>
  );
}

/* ---------------------------------------------------------------- editor --- */

function TemplateEditor({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateRow | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveTemplateAction,
    null
  );

  const [channel, setChannel] = React.useState(template?.channel ?? "email");
  const [subject, setSubject] = React.useState(template?.subject ?? "");
  const [body, setBody] = React.useState(
    template?.body ??
      "Olá {{cliente}}, sua cobrança do projeto {{projeto}} no valor de {{valor}} vence em {{vencimento}}.\n\nPague em segundos: {{link_pagamento}}"
  );
  const [active, setActive] = React.useState(template?.is_active ?? true);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Modelo salvo");
      onOpenChange(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function insertVariable(variable: string) {
    const token = `{{${variable}}}`;
    const field = bodyRef.current;

    if (!field) {
      setBody((current) => `${current}${token}`);
      return;
    }

    const start = field.selectionStart ?? body.length;
    const end = field.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);

    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const errors = state?.fieldErrors ?? {};

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={template ? `Editar ${template.name}` : "Novo modelo"}
      description="Escreva o texto com variáveis e confira a pré-visualização ao lado."
      size="xl"
      icon={<MessageSquareText />}
      locked={pending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="template-form" loading={pending} icon={<Save />}>
            {template ? "Salvar alterações" : "Criar modelo"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <form id="template-form" action={formAction} className="space-y-5">
          {template && <input type="hidden" name="id" value={template.id} />}
          <input type="hidden" name="is_active" value={active ? "true" : "false"} />

          <FormError message={state?.error} />

          <FieldGroup>
            <Field label="Nome do modelo" htmlFor="name" error={errors.name} required>
              <Input
                id="name"
                name="name"
                defaultValue={template?.name}
                placeholder="Aviso de vencimento"
                required
              />
            </Field>

            <Field
              label="Chave"
              htmlFor="key"
              error={errors.key}
              hint="Identificador usado pela automação"
              required
            >
              <Input
                id="key"
                name="key"
                defaultValue={template?.key}
                placeholder="invoice.due_soon"
                required
              />
            </Field>
          </FieldGroup>

          <Field label="Canal" htmlFor="channel" error={errors.channel}>
            <NativeSelect
              id="channel"
              name="channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {CHANNELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          {channel === "email" && (
            <Field label="Assunto" htmlFor="subject" error={errors.subject} required>
              <Input
                id="subject"
                name="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Sua cobrança de {{valor}} vence em {{vencimento}}"
                required
              />
            </Field>
          )}
          {channel !== "email" && <input type="hidden" name="subject" value="" />}

          <Field
            label="Corpo da mensagem"
            htmlFor="body"
            error={errors.body}
            required
            action={
              <span className="text-[11px] text-ink-400">{body.length} caracteres</span>
            }
          >
            <Textarea
              id="body"
              name="body"
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-[180px] font-mono text-[12.5px]"
              required
            />
          </Field>

          <div className="space-y-2">
            <p className="text-[12px] font-medium text-ink-600">Inserir variável</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLE_HINTS.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insertVariable(variable)}
                  className="rounded-md bg-ink-100 px-2 py-1 font-mono text-[11px] text-ink-700 transition-colors hover:bg-brand-100 hover:text-brand-700"
                >
                  {`{{${variable}}}`}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-ink-200 bg-white px-3.5 py-3">
            <span className="space-y-0.5">
              <span className="block text-[13px] font-medium text-ink-800">Modelo ativo</span>
              <span className="block text-xs text-ink-500">
                Modelos inativos ficam disponíveis apenas para consulta
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </form>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <PreviewPanel channel={channel} subject={subject} body={body} />
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- preview --- */

function PreviewPanel({
  channel,
  subject,
  body,
}: {
  channel: string;
  subject: string;
  body: string;
}) {
  const meta = channelMeta(channel);
  const Icon = meta.icon;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-3.5" />
        </span>
        <p className="text-[12.5px] font-medium text-ink-700">
          Pré-visualização · {meta.label}
        </p>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card)]",
          channel !== "email" && "bg-ink-50/40"
        )}
      >
        {channel === "email" ? (
          <>
            <div className="space-y-1 border-b border-ink-200/70 bg-ink-50/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Assunto</p>
              <p className="text-[13px] font-medium text-ink-900">
                {subject ? renderPreview(subject) : "— sem assunto —"}
              </p>
            </div>
            <div className="whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-ink-700">
              {renderPreview(body) || "— sem conteúdo —"}
            </div>
          </>
        ) : (
          <div className="px-4 py-4">
            <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-emerald-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-800 ring-1 ring-inset ring-emerald-100">
              {renderPreview(body) || "— sem conteúdo —"}
            </div>
          </div>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-400">
        Os valores acima são apenas exemplos. No envio real, cada variável é substituída pelos
        dados da cobrança.
      </p>
    </div>
  );
}
