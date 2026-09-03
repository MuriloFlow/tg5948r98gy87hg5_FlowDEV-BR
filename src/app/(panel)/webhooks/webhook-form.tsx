"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Webhook } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import {
  createWebhookEndpointAction,
  updateWebhookEndpointAction,
} from "@/server/webhook-endpoints";
import type { ActionResult } from "@/server/action-utils";
import { WEBHOOK_EVENT_TYPES, type WebhookEndpoint } from "@/lib/types";
import { eventLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface WebhookProjectOption {
  id: string;
  name: string;
}

const DEFAULT_EVENTS = [
  "payment.created",
  "payment.pending",
  "payment.paid",
  "payment.failed",
  "payment.expired",
  "project.blocked",
  "project.unblocked",
];

function EventPicker({ defaultEvents }: { defaultEvents: string[] }) {
  const [selected, setSelected] = React.useState<string[]>(defaultEvents);

  function toggle(type: string) {
    setSelected((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    );
  }

  const allSelected = selected.length === WEBHOOK_EVENT_TYPES.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-700">
          Eventos assinados
          <span className="ml-1.5 text-[11.5px] font-normal text-ink-400">
            {selected.length} de {WEBHOOK_EVENT_TYPES.length}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setSelected(allSelected ? [] : [...WEBHOOK_EVENT_TYPES])}
          className="text-[12px] font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          {allSelected ? "Limpar seleção" : "Selecionar todos"}
        </button>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {WEBHOOK_EVENT_TYPES.map((type) => {
          const active = selected.includes(type);
          return (
            <label
              key={type}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-150",
                active
                  ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
                  : "border-ink-200 hover:border-ink-300"
              )}
            >
              <input
                type="checkbox"
                name="events"
                value={type}
                checked={active}
                onChange={() => toggle(type)}
                className="mt-0.5 size-3.5 shrink-0 accent-brand-500"
              />
              <span className="min-w-0">
                <span className="block font-mono text-[11.5px] text-ink-900">{type}</span>
                <span className="block text-[11.5px] leading-snug text-ink-500">
                  {eventLabel(type)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function WebhookFormModal({
  open,
  onOpenChange,
  endpoint,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint?: WebhookEndpoint | null;
  projects: WebhookProjectOption[];
  defaultProjectId?: string | null;
}) {
  const router = useRouter();
  const editing = Boolean(endpoint);
  const action = editing ? updateWebhookEndpointAction : createWebhookEndpointAction;

  const [state, formAction, pending] = useActionState<
    ActionResult<WebhookEndpoint> | null,
    FormData
  >(action, null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Salvo com sucesso");
      onOpenChange(false);
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
      title={editing ? "Editar endpoint" : "Novo endpoint de webhook"}
      description={
        editing
          ? "Ajuste a URL de destino e quais eventos este endpoint recebe."
          : "Informe a URL que vai receber os eventos assinados com HMAC-SHA256."
      }
      size="lg"
      locked={pending}
      icon={<Webhook />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="webhook-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Criar endpoint"}
          </Button>
        </>
      }
    >
      <form id="webhook-form" action={formAction} className="space-y-6">
        {editing && <input type="hidden" name="id" value={endpoint!.id} />}
        {editing && <input type="hidden" name="project_id" value={endpoint!.project_id} />}

        <FormError message={state?.error} />

        {!editing && (
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

        <FieldGroup columns={1}>
          <Field
            label="URL de destino"
            htmlFor="url"
            error={errors.url}
            hint="Precisa responder 2xx em até 10 segundos"
            required
          >
            <Input
              id="url"
              name="url"
              type="url"
              defaultValue={endpoint?.url ?? ""}
              placeholder="https://app.meucliente.com.br/webhooks/flowdesk"
              className="font-mono text-[12.5px]"
              required
            />
          </Field>

          <Field label="Descrição" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              defaultValue={endpoint?.description ?? ""}
              placeholder="Para que serve este endpoint"
              className="min-h-[64px]"
            />
          </Field>
        </FieldGroup>

        <div className="border-t border-ink-200 pt-5">
          {errors.events && <p className="mb-2 text-xs text-rose-600">{errors.events}</p>}
          <EventPicker defaultEvents={endpoint?.events ?? DEFAULT_EVENTS} />
        </div>
      </form>
    </Modal>
  );
}
