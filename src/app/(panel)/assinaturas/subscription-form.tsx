"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Repeat, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CurrencyInput, Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { SwitchField } from "@/components/ui/misc";
import { createSubscriptionAction, updateSubscriptionAction } from "@/server/subscriptions";
import type { ActionResult } from "@/server/action-utils";
import { formatCurrency } from "@/lib/format";
import { BILLING_INTERVAL, PAYMENT_METHOD } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { BillingInterval, PaymentMethod, Subscription } from "@/lib/types";
import type { ProjectOption } from "../cobrancas/invoice-form";

const INTERVALS: BillingInterval[] = [
  "ONE_TIME",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
];

const SELECTABLE_METHODS: PaymentMethod[] = ["PIX", "CREDIT_CARD", "BOLETO"];

/** Fator de conversão do valor do ciclo para MRR. */
export const MONTHLY_FACTOR: Record<BillingInterval, number> = {
  ONE_TIME: 0,
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  BIMONTHLY: 1 / 2,
  QUARTERLY: 1 / 3,
  SEMIANNUAL: 1 / 6,
  ANNUAL: 1 / 12,
};

export function monthlyValue(
  amount: number,
  interval: BillingInterval,
  intervalCount: number
): number {
  const factor = MONTHLY_FACTOR[interval] ?? 0;
  if (!factor) return 0;
  return (amount * factor) / Math.max(1, intervalCount);
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function SubscriptionFormModal({
  open,
  onOpenChange,
  subscription,
  projects,
  presetProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription?: Subscription | null;
  projects: ProjectOption[];
  presetProjectId?: string | null;
}) {
  const router = useRouter();
  const editing = Boolean(subscription);
  const action = editing ? updateSubscriptionAction : createSubscriptionAction;

  const [state, formAction, pending] = useActionState<ActionResult<Subscription> | null, FormData>(
    action,
    null
  );

  const [amount, setAmount] = React.useState(Number(subscription?.amount ?? 0));
  const [interval, setInterval] = React.useState<BillingInterval>(
    subscription?.interval ?? "MONTHLY"
  );
  const [intervalCount, setIntervalCount] = React.useState(
    String(subscription?.interval_count ?? 1)
  );
  const [billingDay, setBillingDay] = React.useState(
    subscription?.billing_day ? String(subscription.billing_day) : ""
  );
  const [autoCharge, setAutoCharge] = React.useState(subscription?.auto_charge ?? true);
  const [mandatory, setMandatory] = React.useState(subscription?.is_mandatory ?? true);
  const [methods, setMethods] = React.useState<PaymentMethod[]>(
    subscription?.payment_methods?.length
      ? subscription.payment_methods
      : ["PIX", "CREDIT_CARD", "BOLETO"]
  );

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Recorrência salva");
      onOpenChange(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state?.fieldErrors ?? {};
  const count = Number(intervalCount) || 1;
  const mrr = monthlyValue(amount, interval, count);
  const isOneTime = interval === "ONE_TIME";

  function toggleMethod(method: PaymentMethod) {
    setMethods((current) =>
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method]
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Editar ${subscription?.name}` : "Nova recorrência"}
      description="A recorrência gera as cobranças automaticamente na janela de emissão configurada."
      size="lg"
      locked={pending}
      icon={<Repeat />}
      footer={
        <>
          <div className="mr-auto flex items-baseline gap-2 text-[13px] text-ink-500">
            <span>MRR</span>
            <span className="text-[17px] font-semibold tabular text-ink-900">
              {formatCurrency(mrr)}
            </span>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="subscription-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Criar recorrência"}
          </Button>
        </>
      }
    >
      <form id="subscription-form" action={formAction} className="space-y-6">
        {editing && <input type="hidden" name="id" value={subscription!.id} />}
        <input type="hidden" name="auto_charge" value={autoCharge ? "on" : ""} />
        <input type="hidden" name="is_mandatory" value={mandatory ? "on" : ""} />
        {methods.map((method) => (
          <input key={method} type="hidden" name="payment_methods" value={method} />
        ))}

        <FormError message={state?.error} />

        {projects.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
            Nenhum projeto disponível. Crie um projeto antes de configurar recorrências.
          </div>
        )}

        <FieldGroup>
          <Field label="Projeto" htmlFor="sub-project" error={errors.project_id} required>
            <NativeSelect
              id="sub-project"
              name="project_id"
              defaultValue={subscription?.project_id ?? presetProjectId ?? projects[0]?.id ?? ""}
              disabled={editing}
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

          <Field label="Nome da recorrência" htmlFor="sub-name" error={errors.name} required>
            <Input
              id="sub-name"
              name="name"
              defaultValue={subscription?.name ?? ""}
              placeholder="Mensalidade do sistema"
              required
            />
          </Field>
        </FieldGroup>

        <Field
          label="Descrição"
          htmlFor="sub-description"
          error={errors.description}
          hint="Usada como descrição das cobranças geradas"
        >
          <Input
            id="sub-description"
            name="description"
            defaultValue={subscription?.description ?? ""}
            placeholder="Licença de uso e suporte técnico"
          />
        </Field>

        <div className="space-y-4 rounded-xl border border-ink-200 bg-ink-50/40 p-4">
          <p className="text-[13px] font-semibold text-ink-800">Ritmo de cobrança</p>

          <FieldGroup columns={3}>
            <Field label="Valor por ciclo" htmlFor="sub-amount" error={errors.amount} required>
              <CurrencyInput
                id="sub-amount"
                name="amount"
                value={amount}
                onValueChange={setAmount}
              />
            </Field>

            <Field label="Intervalo" htmlFor="sub-interval" error={errors.interval}>
              <NativeSelect
                id="sub-interval"
                name="interval"
                value={interval}
                onChange={(event) => setInterval(event.target.value as BillingInterval)}
              >
                {INTERVALS.map((option) => (
                  <option key={option} value={option}>
                    {BILLING_INTERVAL[option].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="A cada N períodos"
              htmlFor="sub-interval-count"
              error={errors.interval_count}
              hint={isOneTime ? "Não se aplica a cobrança única" : "1 = todo período"}
            >
              <Input
                id="sub-interval-count"
                name="interval_count"
                type="number"
                min={1}
                max={24}
                value={intervalCount}
                onChange={(event) => setIntervalCount(event.target.value)}
                disabled={isOneTime}
              />
            </Field>
          </FieldGroup>

          <FieldGroup columns={3}>
            <Field
              label="Dia fixo de cobrança"
              htmlFor="sub-billing-day"
              error={errors.billing_day}
              hint="Ex.: todo dia 5"
            >
              <NativeSelect
                id="sub-billing-day"
                name="billing_day"
                value={billingDay}
                onChange={(event) => setBillingDay(event.target.value)}
                disabled={isOneTime}
              >
                <option value="">Usar o dia do início</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    Todo dia {day}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="Gerar fatura N dias antes"
              htmlFor="sub-generate-before"
              error={errors.generate_days_before}
            >
              <Input
                id="sub-generate-before"
                name="generate_days_before"
                type="number"
                min={0}
                max={60}
                defaultValue={subscription?.generate_days_before ?? 7}
              />
            </Field>

            <Field label="Início" htmlFor="sub-start" error={errors.start_date} required>
              <Input
                id="sub-start"
                name="start_date"
                type="date"
                defaultValue={subscription?.start_date ?? todayISO()}
                required
              />
            </Field>
          </FieldGroup>

          <FieldGroup columns={2}>
            <Field
              label="Encerrar em"
              htmlFor="sub-end"
              error={errors.end_date}
              hint="Deixe vazio para recorrência sem fim"
            >
              <Input
                id="sub-end"
                name="end_date"
                type="date"
                defaultValue={subscription?.end_date ?? ""}
              />
            </Field>
            <Field
              label="Limite de ciclos"
              htmlFor="sub-max-cycles"
              error={errors.max_cycles}
              hint={
                subscription
                  ? `${subscription.cycles_billed} ciclo(s) já faturado(s)`
                  : "Deixe vazio para ilimitado"
              }
            >
              <Input
                id="sub-max-cycles"
                name="max_cycles"
                type="number"
                min={1}
                max={999}
                defaultValue={subscription?.max_cycles ?? ""}
                placeholder="Ilimitado"
              />
            </Field>
          </FieldGroup>

          <p className="flex items-start gap-2 rounded-lg bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-500">
            <CalendarClock className="mt-px size-4 shrink-0 text-ink-400" aria-hidden />
            Com dia fixo definido, a primeira cobrança cai no primeiro dia {billingDay || "—"} a
            partir do início. As próximas seguem o intervalo escolhido.
          </p>
        </div>

        <div className="space-y-3">
          <SwitchField
            label="Cobrança automática"
            description="Gera a fatura sozinha na janela de emissão. Desligado, a recorrência serve apenas como agenda."
            checked={autoCharge}
            onCheckedChange={setAutoCharge}
          />
          <SwitchField
            label="Obrigatória (bloqueia o projeto)"
            description="Se a cobrança gerada vencer e passar a carência, o acesso do projeto é suspenso automaticamente."
            checked={mandatory}
            onCheckedChange={setMandatory}
          />
        </div>

        <FieldGroup columns={3}>
          <Field
            label="Carência (dias)"
            htmlFor="sub-grace"
            error={errors.grace_days}
            hint="Após o vencimento"
          >
            <Input
              id="sub-grace"
              name="grace_days"
              type="number"
              min={0}
              max={90}
              defaultValue={subscription?.grace_days ?? 3}
            />
          </Field>
          <Field label="Multa (%)" htmlFor="sub-late-fee" error={errors.late_fee_percent}>
            <Input
              id="sub-late-fee"
              name="late_fee_percent"
              inputMode="decimal"
              defaultValue={String(subscription?.late_fee_percent ?? 2)}
            />
          </Field>
          <Field
            label="Juros (% a.m.)"
            htmlFor="sub-interest"
            error={errors.interest_percent_month}
          >
            <Input
              id="sub-interest"
              name="interest_percent_month"
              inputMode="decimal"
              defaultValue={String(subscription?.interest_percent_month ?? 1)}
            />
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
      </form>
    </Modal>
  );
}
