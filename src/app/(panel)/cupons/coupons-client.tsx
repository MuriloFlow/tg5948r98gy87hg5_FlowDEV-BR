"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BadgePercent,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Save,
  Ticket,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea, CurrencyInput } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CopyButton, Progress, Switch } from "@/components/ui/misc";
import {
  createCouponAction,
  deleteCouponAction,
  toggleCouponAction,
} from "@/server/finance-extra";
import type { ActionResult } from "@/server/action-utils";
import { formatCurrency, formatDate, formatPercent, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  max_redemptions: number | null;
  redemptions: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function discountLabel(coupon: CouponRow): string {
  return coupon.discount_type === "PERCENT"
    ? formatPercent(Number(coupon.discount_value), 0)
    : formatCurrency(Number(coupon.discount_value));
}

type CouponState = "active" | "inactive" | "expired" | "exhausted" | "scheduled";

function couponState(coupon: CouponRow): CouponState {
  const now = Date.now();
  if (!coupon.is_active) return "inactive";
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() <= now) return "expired";
  if (new Date(coupon.valid_from).getTime() > now) return "scheduled";
  if (coupon.max_redemptions != null && coupon.redemptions >= coupon.max_redemptions) {
    return "exhausted";
  }
  return "active";
}

const STATE_META: Record<CouponState, { label: string; tone: "success" | "neutral" | "danger" | "warning" | "info" }> = {
  active: { label: "Disponível", tone: "success" },
  inactive: { label: "Desativado", tone: "neutral" },
  expired: { label: "Expirado", tone: "danger" },
  exhausted: { label: "Esgotado", tone: "warning" },
  scheduled: { label: "Agendado", tone: "info" },
};

/** Converte ISO para o formato aceito por <input type="date">. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function CouponsClient({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CouponRow | null>(null);
  const [confirm, setConfirm] = React.useState<CouponRow | null>(null);
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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-500">
          O desconto é aplicado no total da cobrança no momento do resgate.
        </p>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Novo cupom
        </Button>
      </div>

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Código</TH>
              <TH>Desconto</TH>
              <TH>Validade</TH>
              <TH>Resgates</TH>
              <TH>Situação</TH>
              <TH align="center">Ativo</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {coupons.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<Ticket />}
                title="Nenhum cupom cadastrado"
                description="Crie cupons percentuais ou de valor fixo para campanhas, indicações e renegociações."
                action={
                  <Button
                    size="sm"
                    icon={<Plus />}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    Criar cupom
                  </Button>
                }
              />
            ) : (
              coupons.map((coupon) => {
                const state = couponState(coupon);
                const meta = STATE_META[state];
                const limit = coupon.max_redemptions;
                const usage = limit ? Math.min(100, (coupon.redemptions / limit) * 100) : 0;

                return (
                  <TR key={coupon.id}>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[13px] font-semibold text-ink-900">
                          {coupon.code}
                        </span>
                        <CopyButton value={coupon.code} label="Copiar código" />
                      </div>
                      {coupon.description && (
                        <span className="block max-w-[240px] truncate text-[11.5px] text-ink-400">
                          {coupon.description}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className="font-semibold tabular text-ink-900">
                        {discountLabel(coupon)}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        {coupon.discount_type === "PERCENT" ? "percentual" : "valor fixo"}
                      </span>
                    </TD>
                    <TD>
                      <span className="block text-[12.5px] text-ink-700">
                        {coupon.valid_until
                          ? `até ${formatDate(coupon.valid_until)}`
                          : "sem prazo"}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        início {formatDate(coupon.valid_from)}
                      </span>
                    </TD>
                    <TD>
                      <div className="w-[140px] space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12.5px] font-medium tabular text-ink-800">
                            {coupon.redemptions}
                            {limit ? ` / ${limit}` : ""}
                          </span>
                          {limit && (
                            <span className="text-[11px] text-ink-400">
                              {Math.round(usage)}%
                            </span>
                          )}
                        </div>
                        {limit ? (
                          <Progress
                            value={usage}
                            tone={usage >= 100 ? "danger" : usage >= 75 ? "warning" : "brand"}
                          />
                        ) : (
                          <p className="text-[11px] text-ink-400">resgates ilimitados</p>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={meta.tone} size="sm" dot>
                        {meta.label}
                      </Badge>
                    </TD>
                    <TD align="center">
                      <Switch
                        checked={coupon.is_active}
                        disabled={busy === `toggle:${coupon.id}`}
                        onCheckedChange={(checked) =>
                          void perform(`toggle:${coupon.id}`, () =>
                            toggleCouponAction(coupon.id, checked)
                          )
                        }
                        aria-label={coupon.is_active ? "Desativar cupom" : "Ativar cupom"}
                      />
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="iconXs" aria-label="Ações do cupom">
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            icon={<Pencil />}
                            onSelect={() => {
                              setEditing(coupon);
                              setFormOpen(true);
                            }}
                          >
                            Editar cupom
                          </MenuItem>
                          <MenuItem
                            icon={coupon.is_active ? <PowerOff /> : <Power />}
                            onSelect={() =>
                              void perform(`toggle:${coupon.id}`, () =>
                                toggleCouponAction(coupon.id, !coupon.is_active)
                              )
                            }
                          >
                            {coupon.is_active ? "Desativar" : "Ativar"}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            icon={<Trash2 />}
                            destructive
                            onSelect={() => setConfirm(coupon)}
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

      {formOpen && (
        <CouponForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          coupon={editing}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Excluir o cupom ${confirm.code}?` : ""}
        description="Cupons já resgatados não podem ser excluídos — nesse caso, desative-o para preservar o histórico."
        confirmLabel="Excluir cupom"
        destructive
        loading={busy === "delete"}
        onConfirm={async () => {
          if (!confirm) return;
          const done = await perform("delete", () => deleteCouponAction(confirm.id));
          if (done) setConfirm(null);
        }}
      />
    </>
  );
}

function CouponForm({
  open,
  onOpenChange,
  coupon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: CouponRow | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createCouponAction,
    null
  );

  const [type, setType] = React.useState<"PERCENT" | "FIXED">(coupon?.discount_type ?? "PERCENT");
  const [amount, setAmount] = React.useState(
    coupon && coupon.discount_type === "FIXED" ? Number(coupon.discount_value) : 0
  );
  const [percent, setPercent] = React.useState(
    coupon && coupon.discount_type === "PERCENT" ? String(coupon.discount_value) : "10"
  );
  const [limited, setLimited] = React.useState(coupon?.max_redemptions != null);
  const [active, setActive] = React.useState(coupon?.is_active ?? true);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Cupom salvo");
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
      title={coupon ? `Editar ${coupon.code}` : "Novo cupom"}
      description="Defina o desconto, a validade e o limite de resgates."
      size="md"
      icon={<BadgePercent />}
      locked={pending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="coupon-form" loading={pending} icon={<Save />}>
            {coupon ? "Salvar alterações" : "Criar cupom"}
          </Button>
        </>
      }
    >
      <form id="coupon-form" action={formAction} className="space-y-5">
        {coupon && <input type="hidden" name="id" value={coupon.id} />}
        <input type="hidden" name="discount_type" value={type} />
        <input type="hidden" name="amount_cents" value={Math.round(amount * 100)} />
        <input type="hidden" name="percent_value" value={percent} />
        <input type="hidden" name="is_active" value={active ? "true" : "false"} />

        <FormError message={state?.error} />

        <FieldGroup>
          <Field label="Código" htmlFor="code" error={errors.code} required>
            <Input
              id="code"
              name="code"
              defaultValue={coupon?.code}
              placeholder="BEMVINDO10"
              className="font-mono uppercase"
              required
            />
          </Field>

          <Field label="Tipo de desconto" htmlFor="type">
            <NativeSelect
              id="type"
              value={type}
              onChange={(event) => setType(event.target.value as "PERCENT" | "FIXED")}
            >
              <option value="PERCENT">Percentual (%)</option>
              <option value="FIXED">Valor fixo (R$)</option>
            </NativeSelect>
          </Field>
        </FieldGroup>

        {type === "PERCENT" ? (
          <Field
            label="Percentual de desconto"
            htmlFor="percent"
            error={errors.discount_value}
            hint="Entre 1% e 100%"
            required
          >
            <Input
              id="percent"
              type="number"
              min={1}
              max={100}
              step="0.5"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              suffix="%"
              required
            />
          </Field>
        ) : (
          <Field
            label="Valor do desconto"
            htmlFor="amount"
            error={errors.discount_value}
            required
          >
            <CurrencyInput id="amount" value={amount} onValueChange={setAmount} />
          </Field>
        )}

        <FieldGroup>
          <Field label="Válido a partir de" htmlFor="valid_from" error={errors.valid_from}>
            <Input
              id="valid_from"
              name="valid_from"
              type="date"
              defaultValue={
                coupon ? toDateInput(coupon.valid_from) : new Date().toISOString().slice(0, 10)
              }
            />
          </Field>

          <Field
            label="Válido até"
            htmlFor="valid_until"
            error={errors.valid_until}
            hint="Deixe vazio para não expirar"
          >
            <Input
              id="valid_until"
              name="valid_until"
              type="date"
              defaultValue={toDateInput(coupon?.valid_until ?? null)}
            />
          </Field>
        </FieldGroup>

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-ink-200 bg-white px-3.5 py-3">
            <span className="space-y-0.5">
              <span className="block text-[13px] font-medium text-ink-800">
                Limitar resgates
              </span>
              <span className="block text-xs text-ink-500">
                Encerra o cupom automaticamente ao atingir o limite
              </span>
            </span>
            <Switch checked={limited} onCheckedChange={setLimited} />
          </label>

          {limited && (
            <Field
              label="Máximo de resgates"
              htmlFor="max_redemptions"
              error={errors.max_redemptions}
              className={cn("animate-slide-up")}
            >
              <Input
                id="max_redemptions"
                name="max_redemptions"
                type="number"
                min={1}
                defaultValue={coupon?.max_redemptions ?? 100}
              />
            </Field>
          )}
        </div>

        <Field label="Descrição interna" htmlFor="description" error={errors.description}>
          <Textarea
            id="description"
            name="description"
            defaultValue={coupon?.description ?? ""}
            placeholder="Campanha de indicação — setembro/2026"
          />
        </Field>

        <label className="flex items-center justify-between gap-4 rounded-lg border border-ink-200 bg-white px-3.5 py-3">
          <span className="space-y-0.5">
            <span className="block text-[13px] font-medium text-ink-800">Cupom ativo</span>
            <span className="block text-xs text-ink-500">
              Cupons inativos são recusados no checkout
            </span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} />
        </label>

        {coupon && (
          <p className="text-[11.5px] text-ink-400">
            Criado {formatRelative(coupon.created_at)} · {coupon.redemptions} resgate(s) até agora.
          </p>
        )}
      </form>
    </Modal>
  );
}
