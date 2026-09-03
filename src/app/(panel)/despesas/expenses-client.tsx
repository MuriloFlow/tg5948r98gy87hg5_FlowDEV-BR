"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Switch } from "@/components/ui/misc";
import { DonutChart } from "@/components/panel/revenue-chart";
import { DataToolbar } from "@/components/panel/toolbar";
import {
  createExpenseAction,
  deleteExpenseAction,
  markExpensePaidAction,
  updateExpenseAction,
} from "@/server/finance-extra";
import type { ActionResult } from "@/server/action-utils";
import { BILLING_INTERVAL } from "@/lib/labels";
import { daysBetween, formatCurrency, formatDate } from "@/lib/format";
import type { BillingInterval } from "@/lib/types";

export interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

export interface CategorySlice {
  name: string;
  value: number;
}

export interface ExpenseRow {
  id: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  project_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  is_recurring: boolean;
  interval: BillingInterval | null;
  notes: string | null;
  created_at: string;
  project_name?: string | null;
}

const CATEGORIES = [
  { value: "infra", label: "Infraestrutura" },
  { value: "software", label: "Software e licenças" },
  { value: "servicos", label: "Serviços" },
  { value: "pessoal", label: "Pessoal" },
  { value: "marketing", label: "Marketing" },
  { value: "impostos", label: "Impostos" },
  { value: "taxas", label: "Taxas do gateway" },
  { value: "outros", label: "Outros" },
];

const RECURRING_INTERVALS: BillingInterval[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
];

function categoryLabel(value: string): string {
  return CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

export function ExpensesClient({
  expenses,
  projects,
  categories,
  canWrite,
}: {
  expenses: ExpenseRow[];
  projects: ProjectOption[];
  categories: CategorySlice[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseRow | null>(null);
  const [confirm, setConfirm] = React.useState<ExpenseRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function perform(key: string, action: () => Promise<ActionResult>) {
    setBusy(key);
    const result = await action();
    setBusy(null);

    if (result.ok) {
      toast.success(result.message ?? "Concluído");
      router.refresh();
      return true;
    }
    toast.error(result.error ?? "Não foi possível concluir");
    return false;
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  const totalListed = expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div>
          <DataToolbar
            searchPlaceholder="Buscar pela descrição..."
            filters={[
              { key: "categoria", label: "Categoria", options: CATEGORIES },
              {
                key: "situacao",
                label: "Situação",
                options: [
                  { value: "pendente", label: "A pagar" },
                  { value: "pago", label: "Pago" },
                ],
              },
              {
                key: "projeto",
                label: "Projeto",
                options: projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              },
            ]}
            right={
              canWrite && (
                <Button size="sm" icon={<Plus />} onClick={openCreate}>
                  Nova despesa
                </Button>
              )
            }
          />

          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Descrição</TH>
                  <TH>Categoria</TH>
                  <TH>Projeto</TH>
                  <TH>Vencimento</TH>
                  <TH align="right">Valor</TH>
                  <TH>Situação</TH>
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {expenses.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    icon={<Wallet />}
                    title="Nenhuma despesa lançada"
                    description="Cadastre servidores, licenças e serviços para acompanhar o resultado real do mês."
                    action={
                      canWrite && (
                        <Button size="sm" icon={<Plus />} onClick={openCreate}>
                          Lançar despesa
                        </Button>
                      )
                    }
                  />
                ) : (
                  expenses.map((expense) => {
                    const paid = Boolean(expense.paid_at);
                    const days = expense.due_date ? daysBetween(expense.due_date) : null;
                    const late = !paid && days != null && days < 0;

                    return (
                      <TR key={expense.id}>
                        <TD>
                          <span className="block font-medium text-ink-900">
                            {expense.description}
                          </span>
                          {expense.is_recurring && expense.interval && (
                            <span className="block text-[11px] text-ink-400">
                              recorrente · {BILLING_INTERVAL[expense.interval]?.label ?? expense.interval}
                            </span>
                          )}
                        </TD>
                        <TD>
                          <Badge tone="neutral" size="sm">
                            {categoryLabel(expense.category)}
                          </Badge>
                        </TD>
                        <TD>
                          <span className="block max-w-[150px] truncate text-[12.5px]">
                            {expense.project_name ?? <span className="text-ink-300">geral</span>}
                          </span>
                        </TD>
                        <TD>
                          <span className="block text-[12.5px] text-ink-700">
                            {formatDate(expense.due_date)}
                          </span>
                          {late && (
                            <span className="block text-[11px] font-medium text-rose-600">
                              {Math.abs(days!)} dia(s) em atraso
                            </span>
                          )}
                        </TD>
                        <TD align="right">
                          <span className="font-semibold tabular text-ink-900">
                            {formatCurrency(Number(expense.amount))}
                          </span>
                        </TD>
                        <TD>
                          {paid ? (
                            <Badge tone="success" size="sm" dot>
                              pago em {formatDate(expense.paid_at)}
                            </Badge>
                          ) : (
                            <Badge tone={late ? "danger" : "warning"} size="sm" dot>
                              {late ? "em atraso" : "a pagar"}
                            </Badge>
                          )}
                        </TD>
                        <TD>
                          {canWrite && (
                            <Menu>
                              <MenuTrigger asChild>
                                <Button variant="ghost" size="iconXs" aria-label="Ações da despesa">
                                  <MoreHorizontal />
                                </Button>
                              </MenuTrigger>
                              <MenuContent>
                                <MenuItem
                                  icon={paid ? <Undo2 /> : <Check />}
                                  disabled={busy === `paid:${expense.id}`}
                                  onSelect={() =>
                                    void perform(`paid:${expense.id}`, () =>
                                      markExpensePaidAction(expense.id, !paid)
                                    )
                                  }
                                >
                                  {paid ? "Desfazer baixa" : "Marcar como paga"}
                                </MenuItem>
                                <MenuItem
                                  icon={<Pencil />}
                                  onSelect={() => {
                                    setEditing(expense);
                                    setFormOpen(true);
                                  }}
                                >
                                  Editar despesa
                                </MenuItem>
                                <MenuSeparator />
                                <MenuItem
                                  icon={<Trash2 />}
                                  destructive
                                  onSelect={() => setConfirm(expense)}
                                >
                                  Excluir
                                </MenuItem>
                              </MenuContent>
                            </Menu>
                          )}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
            {expenses.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-ink-200 bg-ink-50/40 px-4 py-2.5">
                <p className="text-[12.5px] text-ink-500">
                  {expenses.length} {expenses.length === 1 ? "despesa" : "despesas"} listadas
                </p>
                <p className="text-[13px] font-semibold tabular text-ink-900">
                  {formatCurrency(totalListed)}
                </p>
              </div>
            )}
          </TableWrap>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Despesas por categoria</CardTitle>
              <p className="text-[12.5px] text-ink-500">Mês corrente, por vencimento</p>
            </div>
          </CardHeader>
          <CardContent>
            <DonutChart data={categories} height={260} />
          </CardContent>
        </Card>
      </div>

      {formOpen && (
        <ExpenseForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          expense={editing}
          projects={projects}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Excluir “${confirm.description}”?` : ""}
        description="A despesa é removida do fluxo de caixa e dos relatórios. Esta ação não pode ser desfeita."
        confirmLabel="Excluir despesa"
        destructive
        loading={busy === "delete"}
        onConfirm={async () => {
          if (!confirm) return;
          const done = await perform("delete", () => deleteExpenseAction(confirm.id));
          if (done) setConfirm(null);
        }}
      />
    </div>
  );
}

function ExpenseForm({
  open,
  onOpenChange,
  expense,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRow | null;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const editing = Boolean(expense);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    editing ? updateExpenseAction : createExpenseAction,
    null
  );

  const [amount, setAmount] = React.useState(Number(expense?.amount ?? 0));
  const [recurring, setRecurring] = React.useState(expense?.is_recurring ?? false);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Despesa salva");
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
      title={editing ? `Editar ${expense?.description}` : "Nova despesa"}
      description="Informe o valor, o vencimento e a categoria para o fluxo de caixa."
      size="md"
      icon={<Wallet />}
      locked={pending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="expense-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Lançar despesa"}
          </Button>
        </>
      }
    >
      <form id="expense-form" action={formAction} className="space-y-5">
        {editing && <input type="hidden" name="id" value={expense!.id} />}
        <input type="hidden" name="amount_cents" value={Math.round(amount * 100)} />
        <input type="hidden" name="is_recurring" value={recurring ? "true" : "false"} />

        <FormError message={state?.error} />

        <Field label="Descrição" htmlFor="description" error={errors.description} required>
          <Input
            id="description"
            name="description"
            defaultValue={expense?.description}
            placeholder="Servidor de aplicação — Hetzner"
            required
          />
        </Field>

        <FieldGroup>
          <Field label="Valor" htmlFor="amount" error={errors.amount} required>
            <CurrencyInput id="amount" value={amount} onValueChange={setAmount} />
          </Field>

          <Field label="Categoria" htmlFor="category" error={errors.category}>
            <NativeSelect
              id="category"
              name="category"
              defaultValue={expense?.category ?? "infra"}
            >
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Vencimento" htmlFor="due_date" error={errors.due_date}>
            <Input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={expense?.due_date ?? ""}
            />
          </Field>

          <Field
            label="Pago em"
            htmlFor="paid_at"
            error={errors.paid_at}
            hint="Deixe vazio se ainda não foi pago"
          >
            <Input
              id="paid_at"
              name="paid_at"
              type="date"
              defaultValue={expense?.paid_at ? expense.paid_at.slice(0, 10) : ""}
            />
          </Field>
        </FieldGroup>

        <Field
          label="Projeto"
          htmlFor="project_id"
          error={errors.project_id}
          hint="Vincule quando o custo pertencer a um projeto específico"
        >
          <NativeSelect
            id="project_id"
            name="project_id"
            defaultValue={expense?.project_id ?? ""}
          >
            <option value="">Despesa geral (sem projeto)</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-ink-200 bg-white px-3.5 py-3">
            <span className="space-y-0.5">
              <span className="block text-[13px] font-medium text-ink-800">
                Despesa recorrente
              </span>
              <span className="block text-xs text-ink-500">
                Considerada nos meses seguintes do fluxo de caixa
              </span>
            </span>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </label>

          {recurring && (
            <Field label="Periodicidade" htmlFor="interval" className="animate-slide-up">
              <NativeSelect
                id="interval"
                name="interval"
                defaultValue={expense?.interval ?? "MONTHLY"}
              >
                {RECURRING_INTERVALS.map((interval) => (
                  <option key={interval} value={interval}>
                    {BILLING_INTERVAL[interval].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <Field label="Observações" htmlFor="notes" error={errors.notes}>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={expense?.notes ?? ""}
            placeholder="Número da nota, forma de pagamento, contrato..."
          />
        </Field>
      </form>
    </Modal>
  );
}
