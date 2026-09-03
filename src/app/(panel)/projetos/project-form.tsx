"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Blocks, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CurrencyInput, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { SwitchField } from "@/components/ui/misc";
import { createProjectAction, updateProjectAction } from "@/server/projects";
import type { ActionResult } from "@/server/action-utils";
import type { Project } from "@/lib/types";
import { cn, slugify } from "@/lib/utils";

export interface CustomerOption {
  id: string;
  name: string;
}

export interface CompanyOption {
  id: string;
  customer_id: string;
  label: string;
}

const PRESET_COLORS = [
  "#635BFF",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#0F172A",
];

function toCents(value: number): string {
  return String(Math.round(value * 100));
}

export function ProjectFormModal({
  open,
  onOpenChange,
  project,
  customers,
  companies = [],
  defaultCustomerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  customers: CustomerOption[];
  companies?: CompanyOption[];
  defaultCustomerId?: string | null;
}) {
  const router = useRouter();
  const editing = Boolean(project);
  const action = editing ? updateProjectAction : createProjectAction;

  const [state, formAction, pending] = useActionState<ActionResult<Project> | null, FormData>(
    action,
    null
  );

  const [name, setName] = React.useState(project?.name ?? "");
  const [slug, setSlug] = React.useState(project?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(Boolean(project));
  const [customerId, setCustomerId] = React.useState(
    project?.customer_id ?? defaultCustomerId ?? ""
  );
  const [color, setColor] = React.useState(project?.color ?? "#635BFF");
  const [monthly, setMonthly] = React.useState(Number(project?.monthly_amount ?? 0));
  const [contract, setContract] = React.useState(Number(project?.contract_value ?? 0));
  const [autoBlock, setAutoBlock] = React.useState((project?.block_mode ?? "AUTO") === "AUTO");

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

  function handleName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  const errors = state?.fieldErrors ?? {};
  const companyOptions = companies.filter((c) => c.customer_id === customerId);
  const metadataDueDay = (project?.metadata as { default_due_day?: number } | undefined)
    ?.default_due_day;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Editar ${project?.name}` : "Novo projeto"}
      description={
        editing
          ? "Ajuste os dados da aplicação integrada e as regras de cobrança."
          : "Cadastre a aplicação que vai consumir a API e receber cobranças."
      }
      size="lg"
      locked={pending}
      icon={<Blocks />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="project-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Criar projeto"}
          </Button>
        </>
      }
    >
      <form id="project-form" action={formAction} className="space-y-6">
        {editing && <input type="hidden" name="id" value={project!.id} />}
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="monthly_amount_cents" value={toCents(monthly)} />
        <input type="hidden" name="contract_value_cents" value={toCents(contract)} />
        <input type="hidden" name="block_mode" value={autoBlock ? "AUTO" : "MANUAL"} />

        <FormError message={state?.error} />

        <FieldGroup>
          <Field label="Nome do projeto" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(event) => handleName(event.target.value)}
              placeholder="Portal do Cliente"
              required
            />
          </Field>

          <Field
            label="Identificador"
            htmlFor="slug"
            error={errors.slug}
            hint="Usado em URLs e integrações. Gerado a partir do nome."
            required
          >
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugify(event.target.value));
              }}
              placeholder="portal-do-cliente"
              className="font-mono text-[12.5px]"
              required
            />
          </Field>

          <Field label="Cliente" htmlFor="customer_id" error={errors.customer_id} required>
            <NativeSelect
              id="customer_id"
              name="customer_id"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
            >
              <option value="">Selecione o cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field
            label="Empresa"
            htmlFor="company_id"
            hint={
              companyOptions.length === 0
                ? "Este cliente ainda não possui empresas cadastradas"
                : "Pessoa jurídica que aparece na cobrança"
            }
          >
            <NativeSelect
              id="company_id"
              name="company_id"
              defaultValue={project?.company_id ?? ""}
              disabled={companyOptions.length === 0}
            >
              <option value="">Sem empresa vinculada</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>

        <Field label="Descrição" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            defaultValue={project?.description ?? ""}
            placeholder="O que esta aplicação faz e como ela usa a API do FlowDesk"
            className="min-h-[70px]"
          />
        </Field>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Aplicação</p>

          <FieldGroup>
            <Field
              label="Domínio principal"
              htmlFor="primary_domain"
              error={errors.primary_domain}
              hint="Sem https://"
            >
              <Input
                id="primary_domain"
                name="primary_domain"
                defaultValue={project?.primary_domain ?? ""}
                placeholder="app.meucliente.com.br"
              />
            </Field>

            <Field
              label="Domínios adicionais"
              htmlFor="domains"
              hint="Separe por vírgula"
            >
              <Input
                id="domains"
                name="domains"
                defaultValue={project?.domains?.join(", ") ?? ""}
                placeholder="staging.meucliente.com.br, www.meucliente.com.br"
              />
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field label="Ambiente" htmlFor="environment" hint="LIVE cobra de verdade">
              <NativeSelect
                id="environment"
                name="environment"
                defaultValue={project?.environment ?? "LIVE"}
              >
                <option value="LIVE">Produção (LIVE)</option>
                <option value="TEST">Testes (TEST)</option>
              </NativeSelect>
            </Field>

            <Field label="Cor de identificação" error={errors.color}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value.toUpperCase())}
                  aria-label="Escolher cor"
                  className="size-9.5 shrink-0 cursor-pointer rounded-lg border border-ink-200 bg-white p-1"
                />
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setColor(preset)}
                      aria-label={`Usar cor ${preset}`}
                      style={{ backgroundColor: preset }}
                      className={cn(
                        "size-6 rounded-full ring-1 ring-inset ring-black/10 transition-transform duration-150 hover:scale-110",
                        color.toUpperCase() === preset && "ring-2 ring-offset-2 ring-brand-500"
                      )}
                    />
                  ))}
                </div>
              </div>
            </Field>
          </FieldGroup>
        </div>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Financeiro</p>

          <FieldGroup columns={3}>
            <Field
              label="Valor mensal"
              error={errors.monthly_amount}
              hint="Entra no MRR do painel"
            >
              <CurrencyInput value={monthly} onValueChange={setMonthly} />
            </Field>

            <Field label="Valor de contrato" error={errors.contract_value} hint="Total fechado">
              <CurrencyInput value={contract} onValueChange={setContract} />
            </Field>

            <Field
              label="Dia de vencimento padrão"
              htmlFor="default_due_day"
              hint="Sugerido nas novas cobranças"
            >
              <NativeSelect
                id="default_due_day"
                name="default_due_day"
                defaultValue={metadataDueDay ? String(metadataDueDay) : ""}
              >
                <option value="">Sem padrão</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    Todo dia {day}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field label="Data de início" htmlFor="started_at">
              <Input
                id="started_at"
                name="started_at"
                type="date"
                defaultValue={project?.started_at ?? ""}
              />
            </Field>

            <Field
              label="Dias de carência"
              htmlFor="grace_days"
              error={errors.grace_days}
              hint="Prazo após o vencimento antes do bloqueio"
            >
              <Input
                id="grace_days"
                name="grace_days"
                type="number"
                min={0}
                max={90}
                defaultValue={project?.grace_days ?? 3}
                suffix="dias"
              />
            </Field>
          </FieldGroup>

          <SwitchField
            label="Bloqueio automático por inadimplência"
            description={
              autoBlock
                ? "O acesso é suspenso sozinho quando uma cobrança obrigatória passa da carência."
                : "Modo manual: o acesso só muda quando alguém da equipe agir."
            }
            checked={autoBlock}
            onCheckedChange={setAutoBlock}
          />
        </div>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <Field label="Tags" htmlFor="tags" hint="Separe por vírgula: saas, prioritário">
            <Input id="tags" name="tags" defaultValue={project?.tags?.join(", ") ?? ""} />
          </Field>

          <Field label="Observações internas" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={project?.notes ?? ""}
              placeholder="Anotações visíveis apenas para a equipe"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
