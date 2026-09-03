"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CurrencyInput, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { createStandaloneLinkAction } from "@/server/payment-links";
import type { ActionResult } from "@/server/action-utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { PaymentLink, PaymentMethod } from "@/lib/types";
import type { ProjectOption } from "../cobrancas/invoice-form";

export interface InvoiceOption {
  id: string;
  code: string;
  description: string;
  project_id: string;
  balance_due: number;
}

const SELECTABLE_METHODS: PaymentMethod[] = ["PIX", "CREDIT_CARD", "BOLETO"];

export function LinkFormModal({
  open,
  onOpenChange,
  projects,
  invoices,
  presetProjectId,
  presetInvoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  invoices: InvoiceOption[];
  presetProjectId?: string | null;
  presetInvoiceId?: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult<PaymentLink> | null, FormData>(
    createStandaloneLinkAction,
    null
  );

  const [projectId, setProjectId] = React.useState(
    presetProjectId ?? projects[0]?.id ?? ""
  );
  const [invoiceId, setInvoiceId] = React.useState(presetInvoiceId ?? "");
  const [amount, setAmount] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [methods, setMethods] = React.useState<PaymentMethod[]>([
    "PIX",
    "CREDIT_CARD",
    "BOLETO",
  ]);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Link criado");
      onOpenChange(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const projectInvoices = invoices.filter((invoice) => invoice.project_id === projectId);
  const selectedInvoice = projectInvoices.find((invoice) => invoice.id === invoiceId) ?? null;
  const errors = state?.fieldErrors ?? {};

  function pickInvoice(id: string) {
    setInvoiceId(id);
    const invoice = invoices.find((row) => row.id === id);
    if (invoice) {
      setAmount(Number(invoice.balance_due));
      setTitle(invoice.description);
    }
  }

  function toggleMethod(method: PaymentMethod) {
    setMethods((current) =>
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method]
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo payment link"
      description="Gere um link público de pagamento — avulso ou vinculado a uma cobrança existente."
      size="md"
      locked={pending}
      icon={<Link2 />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="link-form" loading={pending} icon={<Save />}>
            Criar link
          </Button>
        </>
      }
    >
      <form id="link-form" action={formAction} className="space-y-5">
        {methods.map((method) => (
          <input key={method} type="hidden" name="payment_methods" value={method} />
        ))}

        <FormError message={state?.error} />

        {projects.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
            Nenhum projeto disponível. Cadastre um projeto antes de criar links de pagamento.
          </div>
        )}

        <Field label="Projeto" htmlFor="link-project" error={errors.project_id} required>
          <NativeSelect
            id="link-project"
            name="project_id"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setInvoiceId("");
            }}
            required
          >
            <option value="">Selecione o projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.customer_name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="Vincular a uma cobrança"
          htmlFor="link-invoice"
          error={errors.invoice_id}
          hint="Opcional. Vinculando, o pagamento quita a cobrança e libera o projeto automaticamente."
        >
          <NativeSelect
            id="link-invoice"
            name="invoice_id"
            value={invoiceId}
            onChange={(event) => pickInvoice(event.target.value)}
            disabled={projectInvoices.length === 0}
          >
            <option value="">
              {projectInvoices.length === 0
                ? "Nenhuma cobrança em aberto neste projeto"
                : "Link avulso (sem cobrança)"}
            </option>
            {projectInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.code} · {invoice.description} · {formatCurrency(invoice.balance_due)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Título do link" htmlFor="link-title" error={errors.title} required>
          <Input
            id="link-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Pagamento de implantação"
            required
          />
        </Field>

        <FieldGroup columns={2}>
          <Field
            label="Valor"
            htmlFor="link-amount"
            error={errors.amount}
            hint={
              selectedInvoice
                ? "Vinculado à cobrança: o saldo em aberto é usado no checkout."
                : undefined
            }
            required
          >
            <CurrencyInput
              id="link-amount"
              name="amount"
              value={amount}
              onValueChange={setAmount}
            />
          </Field>
          <Field
            label="Parcelamento máximo"
            htmlFor="link-installments"
            error={errors.max_installments}
          >
            <NativeSelect id="link-installments" name="max_installments" defaultValue="12">
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `Até ${n}x`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>

        <FieldGroup columns={2}>
          <Field
            label="Validade (dias)"
            htmlFor="link-expires"
            error={errors.expires_days}
            hint="Depois disso o link expira"
          >
            <Input
              id="link-expires"
              name="expires_days"
              type="number"
              min={1}
              max={365}
              defaultValue={30}
            />
          </Field>
          <Field
            label="Usos permitidos"
            htmlFor="link-uses"
            error={errors.max_uses}
            hint="1 = link de uso único"
          >
            <Input id="link-uses" name="max_uses" type="number" min={1} max={1000} defaultValue={1} />
          </Field>
        </FieldGroup>

        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-ink-800">Meios de pagamento</p>
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

        <Field label="Descrição" htmlFor="link-description" hint="Aparece na página pública">
          <Textarea
            id="link-description"
            name="description"
            placeholder="Parcela única referente à implantação do sistema"
          />
        </Field>
      </form>
    </Modal>
  );
}
