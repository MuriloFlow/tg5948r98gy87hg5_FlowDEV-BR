"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Save, ShieldAlert, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { CodeBlock, CopyButton } from "@/components/ui/misc";
import { createApiKeyAction, updateApiKeyAction, type IssuedApiKey } from "@/server/apikeys";
import type { ActionResult } from "@/server/action-utils";
import { API_SCOPES, type ApiKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ProjectOption {
  id: string;
  name: string;
  environment: "TEST" | "LIVE";
}

export const SCOPE_LABELS: Record<string, string> = {
  "entitlement:read": "Consultar acesso do projeto",
  "charges:read": "Ler cobranças",
  "charges:write": "Criar e atualizar cobranças",
  "links:write": "Gerar payment links",
  "payments:read": "Ler pagamentos",
  "customers:read": "Ler clientes",
  "webhooks:read": "Ler entregas de webhook",
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

/* ------------------------------------------------------------ Reveal ----- */

export function SecretRevealModal({
  open,
  onOpenChange,
  issued,
  appUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issued: IssuedApiKey | null;
  appUrl: string;
}) {
  const router = useRouter();
  // guardamos o id confirmado em vez de um booleano: cada chave nova recomeça
  // com a confirmação em branco, sem precisar de um efeito de reset
  const [confirmedKeyId, setConfirmedKeyId] = React.useState<string | null>(null);

  if (!issued) return null;

  const confirmed = confirmedKeyId === issued.key_id;

  const envSnippet = [
    `# ${issued.project_name} — ${issued.environment === "LIVE" ? "produção" : "testes"}`,
    `FLOWDESK_API_URL=${appUrl}/api/v1`,
    `FLOWDESK_KEY_ID=${issued.key_id}`,
    `FLOWDESK_API_KEY=${issued.secret}`,
  ].join("\n");

  const curlSnippet = [
    `curl -s "${appUrl}/api/v1/entitlement" \\`,
    `  -H "Authorization: Bearer ${issued.secret}" \\`,
    `  -H "Content-Type: application/json"`,
  ].join("\n");

  function close() {
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Sua chave secreta"
      description={`${issued.name} · ${issued.project_name}`}
      size="lg"
      icon={<KeyRound />}
      footer={
        <Button onClick={close} disabled={!confirmed}>
          {confirmed ? "Concluir" : "Confirme que você copiou a chave"}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-amber-600" aria-hidden />
          <div className="space-y-1">
            <p className="text-[13.5px] font-semibold text-amber-900">
              Copie agora, ela não será exibida novamente
            </p>
            <p className="text-[12.5px] leading-relaxed text-amber-800/90">
              O FlowDesk guarda apenas o hash SHA-256 do secret. Se você perder esta chave, será
              preciso rotacioná-la e atualizar a aplicação.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink-700">Chave secreta</p>
          <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-ink-900">
              {issued.secret}
            </code>
            <CopyButton value={issued.secret} variant="secondary" size="iconSm" />
          </div>
        </div>

        <FieldGroup>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-ink-700">Identificador público</p>
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-600">
                {issued.key_id}
              </code>
              <CopyButton value={issued.key_id} />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-ink-700">Escopos</p>
            <div className="flex flex-wrap gap-1.5">
              {issued.scopes.map((scope) => (
                <Badge key={scope} tone="violet" size="sm" className="font-mono">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>
        </FieldGroup>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink-700">Cole no seu .env</p>
          <CodeBlock code={envSnippet} filename=".env.local" />
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink-700">Teste a chave agora</p>
          <CodeBlock code={curlSnippet} filename="terminal" />
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-200 bg-white px-3.5 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmedKeyId(event.target.checked ? issued.key_id : null)}
            className="mt-0.5 size-4 shrink-0 accent-brand-500"
          />
          <span className="text-[13px] leading-relaxed text-ink-700">
            Guardei a chave em um local seguro (gerenciador de segredos ou variável de ambiente).
          </span>
        </label>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- Form ----- */

function ScopePicker({ defaultScopes }: { defaultScopes: string[] }) {
  const [selected, setSelected] = React.useState<string[]>(defaultScopes);

  function toggle(scope: string) {
    setSelected((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]
    );
  }

  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {API_SCOPES.map((scope) => {
        const active = selected.includes(scope);
        return (
          <label
            key={scope}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-150",
              active
                ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
                : "border-ink-200 hover:border-ink-300"
            )}
          >
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              checked={active}
              onChange={() => toggle(scope)}
              className="mt-0.5 size-3.5 shrink-0 accent-brand-500"
            />
            <span className="min-w-0">
              <span className="block font-mono text-[11.5px] text-ink-900">{scope}</span>
              <span className="block text-[11.5px] leading-snug text-ink-500">
                {scopeLabel(scope)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const DEFAULT_SCOPES = [
  "entitlement:read",
  "charges:read",
  "charges:write",
  "links:write",
  "payments:read",
];

export function ApiKeyFormModal({
  open,
  onOpenChange,
  apiKey,
  projects,
  defaultProjectId,
  appUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey?: ApiKey | null;
  projects: ProjectOption[];
  defaultProjectId?: string | null;
  appUrl: string;
}) {
  const router = useRouter();
  const editing = Boolean(apiKey);

  const [createState, createAction, creating] = useActionState<
    ActionResult<IssuedApiKey> | null,
    FormData
  >(createApiKeyAction, null);
  const [updateState, updateAction, updating] = useActionState<
    ActionResult<ApiKey> | null,
    FormData
  >(updateApiKeyAction, null);

  // a chave recém-criada vem do próprio resultado da action; guardamos apenas
  // qual delas o usuário já dispensou
  const created = createState?.ok ? (createState.data ?? null) : null;
  const [dismissedKeyId, setDismissedKeyId] = React.useState<string | null>(null);
  const issued = created && created.key_id !== dismissedKeyId ? created : null;

  const state = editing ? updateState : createState;
  const pending = editing ? updating : creating;

  React.useEffect(() => {
    if (createState?.ok) {
      onOpenChange(false);
    } else if (createState?.error) {
      toast.error(createState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  React.useEffect(() => {
    if (updateState?.ok) {
      toast.success(updateState.message ?? "Chave atualizada");
      onOpenChange(false);
      router.refresh();
    } else if (updateState?.error) {
      toast.error(updateState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState]);

  const errors = state?.fieldErrors ?? {};

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? `Editar ${apiKey?.name}` : "Nova chave de API"}
        description={
          editing
            ? "Ajuste escopos e limites. O secret não muda — use rotacionar para isso."
            : "O secret é exibido uma única vez logo após a criação."
        }
        size="lg"
        locked={pending}
        icon={<KeyRound />}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" form="api-key-form" loading={pending} icon={<Save />}>
              {editing ? "Salvar alterações" : "Gerar chave"}
            </Button>
          </>
        }
      >
        <form
          id="api-key-form"
          action={editing ? updateAction : createAction}
          className="space-y-6"
        >
          {editing && <input type="hidden" name="id" value={apiKey!.id} />}

          <FormError message={state?.error} />

          {!editing && projects.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
              <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
              <span>Crie um projeto antes de gerar credenciais de API.</span>
            </div>
          )}

          <FieldGroup>
            <Field label="Nome da chave" htmlFor="name" error={errors.name} required>
              <Input
                id="name"
                name="name"
                defaultValue={apiKey?.name ?? ""}
                placeholder="Servidor de produção"
                required
              />
            </Field>

            {editing ? (
              <Field label="Projeto">
                <Input
                  value={projects.find((p) => p.id === apiKey?.project_id)?.name ?? "—"}
                  disabled
                  readOnly
                />
              </Field>
            ) : (
              <Field label="Projeto" htmlFor="project_id" error={errors.project_id} required>
                <NativeSelect
                  id="project_id"
                  name="project_id"
                  defaultValue={defaultProjectId ?? ""}
                  required
                >
                  <option value="">Selecione o projeto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </FieldGroup>

          {!editing && (
            <FieldGroup>
              <Field
                label="Ambiente"
                htmlFor="environment"
                hint="Chaves TEST não movimentam dinheiro real"
              >
                <NativeSelect id="environment" name="environment" defaultValue="LIVE">
                  <option value="LIVE">Produção (LIVE)</option>
                  <option value="TEST">Testes (TEST)</option>
                </NativeSelect>
              </Field>
              <Field label="Expira em" htmlFor="expires_at" hint="Deixe vazio para não expirar">
                <Input id="expires_at" name="expires_at" type="date" />
              </Field>
            </FieldGroup>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-700">Escopos</p>
              {errors.scopes && <p className="text-xs text-rose-600">{errors.scopes}</p>}
            </div>
            <ScopePicker defaultScopes={apiKey?.scopes ?? DEFAULT_SCOPES} />
          </div>

          <div className="space-y-4 border-t border-ink-200 pt-5">
            <p className="text-[13px] font-semibold text-ink-800">Restrições</p>

            <FieldGroup columns={3}>
              <Field
                label="Limite por minuto"
                htmlFor="rate_limit_per_minute"
                error={errors.rate_limit_per_minute}
              >
                <Input
                  id="rate_limit_per_minute"
                  name="rate_limit_per_minute"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={apiKey?.rate_limit_per_minute ?? 120}
                  suffix="req"
                />
              </Field>

              <Field
                label="IPs permitidos"
                htmlFor="allowed_ips"
                hint="Vazio = qualquer IP"
                className="sm:col-span-2 lg:col-span-2"
              >
                <Input
                  id="allowed_ips"
                  name="allowed_ips"
                  defaultValue={apiKey?.allowed_ips?.join(", ") ?? ""}
                  placeholder="200.100.0.1, 200.100.0.2"
                  className="font-mono text-[12.5px]"
                />
              </Field>
            </FieldGroup>

            <Field
              label="Origens permitidas (CORS)"
              htmlFor="allowed_origins"
              hint="Vazio = sem restrição de origem"
            >
              <Input
                id="allowed_origins"
                name="allowed_origins"
                defaultValue={apiKey?.allowed_origins?.join(", ") ?? ""}
                placeholder="https://app.meucliente.com.br"
                className="font-mono text-[12.5px]"
              />
            </Field>
          </div>
        </form>
      </Modal>

      <SecretRevealModal
        open={Boolean(issued)}
        onOpenChange={(next) => !next && setDismissedKeyId(created?.key_id ?? null)}
        issued={issued}
        appUrl={appUrl}
      />
    </>
  );
}
