"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListPlus, Plus, Receipt, Save, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CurrencyInput, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { SwitchField } from "@/components/ui/misc";
import { createInvoiceAction, updateInvoiceAction } from "@/server/invoices";
import type { ActionResult } from "@/server/action-utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Invoice, InvoiceItem, PaymentMethod } from "@/lib/types";

export interface ProjectOption {
  id: string;
  name: string;
  code: string;
  customer_id: string;
  customer_name: string;
}

interface DraftItem {
  key: string;
  description: string;
  quantity: string;
  unitAmount: number;
}

const SELECTABLE_METHODS: PaymentMethod[] = ["PIX", "CREDIT_CARD", "BOLETO"];

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function inDaysISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** Dias entre o vencimento e o expires_at gravado — usado ao reabrir o form. */
function expiresDaysFrom(invoice: Invoice | null | undefined): number {
  if (!invoice?.expires_at) return 30;
  const [y, m, d] = invoice.due_date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const expires = new Date(invoice.expires_at);
  const diff = Math.round((expires.getTime() - due.getTime()) / 86_400_000);
  return diff > 0 && diff <= 365 ? diff : 30;
}

function newItem(): DraftItem {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    quantity: "1",
    unitAmount: 0,
  };
}

export function InvoiceFormModal({
  open,
  onOpenChange,
  invoice,
  items,
  projects,
  presetProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice | null;
  items?: InvoiceItem[];
  projects: ProjectOption[];
  presetProjectId?: string | null;
}) {
  const router = useRouter();
  const editing = Boolean(invoice);
  const action = editing ? updateInvoiceAction : createInvoiceAction;

  const [state, formAction, pending] = useActionState<ActionResult<Invoice> | null, FormData>(
    action,
    null
  );

  const [projectId, setProjectId] = React.useState(
    invoice?.project_id ?? presetProjectId ?? projects[0]?.id ?? ""
  );
  const [mode, setMode] = React.useState<"single" | "items">(
    items && items.length > 0 ? "items" : "single"
  );
  const [draftItems, setDraftItems] = React.useState<DraftItem[]>(
    items && items.length > 0
      ? items.map((item) => ({
          key: item.id,
          description: item.description,
          quantity: String(Number(item.quantity)),
          unitAmount: Number(item.unit_amount),
        }))
      : [newItem()]
  );
  const [amount, setAmount] = React.useState(
    invoice && (!items || items.length === 0) ? Number(invoice.subtotal) : 0
  );
  const [discount, setDiscount] = React.useState(Number(invoice?.discount_amount ?? 0));
  const [mandatory, setMandatory] = React.useState(invoice?.is_mandatory ?? true);
  const [methods, setMethods] = React.useState<PaymentMethod[]>(
    invoice?.payment_methods?.length ? invoice.payment_methods : ["PIX", "CREDIT_CARD", "BOLETO"]
  );

  React.useEffect(() => {
    if (!open) return;

    setProjectId(invoice?.project_id ?? presetProjectId ?? projects[0]?.id ?? "");
    setMode(items && items.length > 0 ? "items" : "single");
    setDraftItems(
      items && items.length > 0
        ? items.map((item) => ({
            key: item.id,
            description: item.description,
            quantity: String(Number(item.quantity)),
            unitAmount: Number(item.unit_amount),
          }))
        : [newItem()]
    );
    setAmount(invoice && (!items || items.length === 0) ? Number(invoice.subtotal) : 0);
    setDiscount(Number(invoice?.discount_amount ?? 0));
    setMandatory(invoice?.is_mandatory ?? true);
    setMethods(
      invoice?.payment_methods?.length ? invoice.payment_methods : ["PIX", "CREDIT_CARD", "BOLETO"]
    );
  }, [open, invoice, items, presetProjectId, projects]);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Cobrança salva");
      onOpenChange(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const itemsSubtotal = draftItems.reduce(
    (sum, item) => sum + (Number(item.quantity.replace(",", ".")) || 0) * item.unitAmount,
    0
  );
  const subtotal = mode === "items" ? itemsSubtotal : amount;
  const total = Math.max(subtotal - discount, 0);

  const serializedItems =
    mode === "items"
      ? JSON.stringify(
          draftItems
            .filter((item) => item.description.trim().length > 0)
            .map((item) => ({
              description: item.description.trim(),
              quantity: Number(item.quantity.replace(",", ".")) || 1,
              unitAmount: item.unitAmount,
            }))
        )
      : "[]";

  const errors = state?.fieldErrors ?? {};
  const selectedProject = projects.find((p) => p.id === projectId);

  function toggleMethod(method: PaymentMethod) {
    setMethods((current) =>
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method]
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Editar ${invoice?.code}` : "Nova cobrança"}
      description={
        editing
          ? "Ajuste os dados da cobrança. Os totais são recalculados pelo banco."
          : "Emita uma cobrança avulsa para um projeto. O link de pagamento é gerado automaticamente."
      }
      size="lg"
      locked={pending}
      icon={<Receipt />}
      footer={
        <>
          <div className="mr-auto flex items-baseline gap-2 text-[13px] text-ink-500">
            <span>Total</span>
            <span className="text-[17px] font-semibold tabular text-ink-900">
              {formatCurrency(total)}
            </span>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="invoice-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Emitir cobrança"}
          </Button>
        </>
      }
    >
      <form id="invoice-form" action={formAction} className="space-y-6">
        {editing && <input type="hidden" name="id" value={invoice!.id} />}
        <input type="hidden" name="items" value={serializedItems} />
        <input type="hidden" name="is_mandatory" value={mandatory ? "on" : ""} />
        {methods.map((method) => (
          <input key={method} type="hidden" name="payment_methods" value={method} />
        ))}

        <FormError message={state?.error} />

        {projects.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
            Nenhum projeto disponível. Cadastre um cliente e um projeto antes de emitir cobranças.
          </div>
        )}

        <FieldGroup>
          <Field label="Projeto" htmlFor="project_id" error={errors.project_id} required>
            {editing ? (
              <>
                <input type="hidden" name="project_id" value={projectId} />
                <Input
                  id="project_id"
                  readOnly
                  disabled
                  value={
                    selectedProject
                      ? `${selectedProject.name} · ${selectedProject.customer_name}`
                      : "Projeto vinculado"
                  }
                  className="bg-ink-50"
                />
                <p className="mt-1 text-[11.5px] text-ink-500">
                  O projeto não pode ser alterado após a emissão da cobrança.
                </p>
              </>
            ) : (
              <NativeSelect
                id="project_id"
                name="project_id"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                invalid={Boolean(errors.project_id)}
                required
              >
                <option value="">Selecione o projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} · {project.customer_name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field
            label="Referência"
            htmlFor="reference"
            error={errors.reference}
            hint="Ex.: Mensalidade Setembro/2026"
          >
            <Input
              id="reference"
              name="reference"
              defaultValue={invoice?.reference ?? ""}
              placeholder="Mensalidade Setembro/2026"
            />
          </Field>
        </FieldGroup>

        <Field label="Descrição" htmlFor="description" error={errors.description} required>
          <Input
            id="description"
            name="description"
            defaultValue={invoice?.description ?? ""}
            placeholder="Manutenção mensal do sistema"
            required
          />
        </Field>

        {/* modo de composição do valor */}
        <div className="space-y-4 rounded-xl border border-ink-200 bg-ink-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink-800">Composição do valor</p>
            <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-inset ring-ink-200">
              {(
                [
                  { value: "single", label: "Valor único" },
                  { value: "items", label: "Itens detalhados" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    mode === option.value
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-500 hover:text-ink-800"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "single" ? (
            <Field label="Valor da cobrança" htmlFor="amount" error={errors.amount} required>
              <CurrencyInput
                id="amount"
                name="amount"
                value={amount}
                onValueChange={setAmount}
              />
            </Field>
          ) : (
            <div className="space-y-3">
              <input type="hidden" name="amount" value="0" />
              {errors.amount && <p className="text-xs text-rose-600">{errors.amount}</p>}

              <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:grid sm:grid-cols-[1fr_80px_140px_110px_32px]">
                <span>Descrição</span>
                <span>Qtd</span>
                <span>Valor unitário</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>

              {draftItems.map((item, index) => {
                const quantity = Number(item.quantity.replace(",", ".")) || 0;
                return (
                  <div
                    key={item.key}
                    className="grid gap-2 sm:grid-cols-[1fr_80px_140px_110px_32px] sm:items-center"
                  >
                    <Input
                      value={item.description}
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, description: event.target.value } : row
                          )
                        )
                      }
                      placeholder={`Item ${index + 1}`}
                    />
                    <Input
                      value={item.quantity}
                      inputMode="decimal"
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, quantity: event.target.value } : row
                          )
                        )
                      }
                      className="text-center"
                    />
                    <CurrencyInput
                      value={item.unitAmount}
                      onValueChange={(value) =>
                        setDraftItems((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, unitAmount: value } : row
                          )
                        )
                      }
                    />
                    <span className="px-1 text-right text-[13px] font-medium tabular text-ink-800">
                      {formatCurrency(quantity * item.unitAmount)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconXs"
                      aria-label="Remover item"
                      disabled={draftItems.length === 1}
                      onClick={() =>
                        setDraftItems((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => setDraftItems((current) => [...current, newItem()])}
                >
                  Adicionar item
                </Button>
                <p className="text-[13px] text-ink-500">
                  Subtotal dos itens{" "}
                  <span className="font-semibold tabular text-ink-900">
                    {formatCurrency(itemsSubtotal)}
                  </span>
                </p>
              </div>
            </div>
          )}

          <FieldGroup columns={2}>
            <Field label="Desconto" htmlFor="discount_amount" error={errors.discount_amount}>
              <CurrencyInput
                id="discount_amount"
                name="discount_amount"
                value={discount}
                onValueChange={setDiscount}
              />
            </Field>
            <div className="flex flex-col justify-end gap-1 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Total a cobrar
              </span>
              <span className="text-[19px] font-semibold leading-none tabular text-ink-900">
                {formatCurrency(total)}
              </span>
            </div>
          </FieldGroup>
        </div>

        <FieldGroup columns={3}>
          <Field label="Vencimento" htmlFor="due_date" error={errors.due_date} required>
            <Input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={invoice?.due_date ?? inDaysISO(7)}
              min={editing ? undefined : todayISO()}
              required
            />
          </Field>

          <Field
            label="Dias até expirar"
            htmlFor="expires_days"
            error={errors.expires_days}
            hint="0 = nunca expira"
          >
            <Input
              id="expires_days"
              name="expires_days"
              type="number"
              min={0}
              max={365}
              defaultValue={expiresDaysFrom(invoice)}
            />
          </Field>

          <Field
            label="Parcelamento máximo"
            htmlFor="max_installments"
            error={errors.max_installments}
          >
            <NativeSelect
              id="max_installments"
              name="max_installments"
              defaultValue={String(invoice?.max_installments ?? 12)}
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `Até ${n}x`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>

        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-ink-800">Meios de pagamento aceitos</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {SELECTABLE_METHODS.map((method) => {
              const active = methods.includes(method);
              return (
                <label
                  key={method}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] transition-all duration-150",
                    active
                      ? "border-brand-400 bg-brand-50/60 text-ink-900 ring-1 ring-brand-200"
                      : "border-ink-200 text-ink-600 hover:border-ink-300"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleMethod(method)}
                    className="size-4 accent-brand-500"
                  />
                  {PAYMENT_METHOD[method].label}
                </label>
              );
            })}
          </div>
          {errors.payment_methods && (
            <p className="text-xs text-rose-600">{errors.payment_methods}</p>
          )}
        </div>

        <SwitchField
          label="Cobrança obrigatória (bloqueia o projeto se vencer)"
          description={
            selectedProject
              ? `Passada a carência do projeto ${selectedProject.name}, o acesso é suspenso automaticamente até o pagamento.`
              : "Passada a carência do projeto, o acesso é suspenso automaticamente até o pagamento."
          }
          checked={mandatory}
          onCheckedChange={setMandatory}
        />

        <FieldGroup>
          <Field
            label="Observações para o cliente"
            htmlFor="notes"
            hint="Aparecem na página pública de pagamento"
          >
            <Textarea
              id="notes"
              name="notes"
              defaultValue={invoice?.notes ?? ""}
              placeholder="Chave Pix alternativa, instruções de nota fiscal..."
            />
          </Field>
          <Field label="Notas internas" htmlFor="internal_notes" hint="Visíveis só para a equipe">
            <Textarea
              id="internal_notes"
              name="internal_notes"
              defaultValue={invoice?.internal_notes ?? ""}
              placeholder="Combinado por telefone com o financeiro"
            />
          </Field>
        </FieldGroup>

        <p className="flex items-start gap-2 rounded-lg bg-ink-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-500">
          <ListPlus className="mt-px size-4 shrink-0 text-ink-400" aria-hidden />
          O total é calculado pelo banco a partir do subtotal, desconto, multa e juros. Quando o
          pagamento é confirmado, a cobrança é quitada e o projeto liberado automaticamente.
        </p>
      </form>
    </Modal>
  );
}
