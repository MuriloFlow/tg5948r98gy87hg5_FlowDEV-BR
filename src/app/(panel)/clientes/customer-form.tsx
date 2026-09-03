"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Save, User } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { createCustomerAction, updateCustomerAction } from "@/server/customers";
import type { ActionResult } from "@/server/action-utils";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

const UF = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function CustomerFormModal({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
}) {
  const router = useRouter();
  const editing = Boolean(customer);
  const action = editing ? updateCustomerAction : createCustomerAction;

  const [state, formAction, pending] = useActionState<ActionResult<Customer> | null, FormData>(
    action,
    null
  );
  const [type, setType] = React.useState<"PF" | "PJ">(customer?.type ?? "PJ");
  const [zip, setZip] = React.useState(customer?.zip_code ?? "");
  const [lookingUpZip, setLookingUpZip] = React.useState(false);
  const [address, setAddress] = React.useState({
    street: customer?.street ?? "",
    district: customer?.district ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
  });

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

  // busca automática de endereço pelo CEP
  async function lookupZip(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLookingUpZip(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setAddress({
          street: data.logradouro ?? "",
          district: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        });
      }
    } catch {
      /* CEP indisponível: o usuário preenche manualmente */
    } finally {
      setLookingUpZip(false);
    }
  }

  const errors = state?.fieldErrors ?? {};

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Editar ${customer?.name}` : "Novo cliente"}
      description={
        editing
          ? "Atualize os dados cadastrais e as preferências de cobrança."
          : "Cadastre o cliente que receberá as cobranças dos projetos."
      }
      size="lg"
      locked={pending}
      icon={type === "PJ" ? <Building2 /> : <User />}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="customer-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Cadastrar cliente"}
          </Button>
        </>
      }
    >
      <form id="customer-form" action={formAction} className="space-y-6">
        {editing && <input type="hidden" name="id" value={customer!.id} />}

        <FormError message={state?.error} />

        {/* tipo de pessoa */}
        <div className="grid grid-cols-2 gap-2">
          {(["PJ", "PF"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-all duration-150",
                type === option
                  ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
                  : "border-ink-200 hover:border-ink-300"
              )}
            >
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  type === option ? "bg-brand-100 text-brand-600" : "bg-ink-100 text-ink-400"
                )}
              >
                {option === "PJ" ? (
                  <Building2 className="size-4" />
                ) : (
                  <User className="size-4" />
                )}
              </span>
              <span>
                <span className="block text-[13px] font-medium text-ink-900">
                  {option === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
                </span>
                <span className="block text-[11.5px] text-ink-500">
                  {option === "PJ" ? "Empresa com CNPJ" : "Cliente com CPF"}
                </span>
              </span>
            </label>
          ))}
        </div>

        <FieldGroup>
          <Field
            label={type === "PJ" ? "Nome do contato" : "Nome completo"}
            htmlFor="name"
            error={errors.name}
            required
          >
            <Input
              id="name"
              name="name"
              defaultValue={customer?.name}
              placeholder={type === "PJ" ? "João Pereira" : "Maria Souza"}
              required
            />
          </Field>

          <Field
            label={type === "PJ" ? "Razão social" : "Nome social"}
            htmlFor="legal_name"
            error={errors.legal_name}
          >
            <Input
              id="legal_name"
              name="legal_name"
              defaultValue={customer?.legal_name ?? ""}
              placeholder={type === "PJ" ? "Mecânica Total Flex LTDA" : "—"}
            />
          </Field>

          <Field
            label={type === "PJ" ? "CNPJ" : "CPF"}
            htmlFor="document"
            error={errors.document}
            hint="Usado no checkout e na nota fiscal"
          >
            <Input
              id="document"
              name="document"
              defaultValue={customer?.document ?? ""}
              placeholder={type === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"}
              inputMode="numeric"
            />
          </Field>

          <Field label="E-mail" htmlFor="email" error={errors.email} required>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={customer?.email}
              placeholder="financeiro@empresa.com.br"
              required
            />
          </Field>

          <Field label="Telefone" htmlFor="phone" error={errors.phone}>
            <Input
              id="phone"
              name="phone"
              defaultValue={customer?.phone ?? ""}
              placeholder="(11) 3000-0000"
            />
          </Field>

          <Field label="WhatsApp" htmlFor="whatsapp" hint="Usado para envio de cobranças">
            <Input
              id="whatsapp"
              name="whatsapp"
              defaultValue={customer?.whatsapp ?? ""}
              placeholder="(11) 90000-0000"
            />
          </Field>
        </FieldGroup>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Endereço</p>
          <FieldGroup columns={3}>
            <Field label="CEP" htmlFor="zip_code">
              <Input
                id="zip_code"
                name="zip_code"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                onBlur={(e) => lookupZip(e.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
                suffix={lookingUpZip ? "buscando..." : undefined}
              />
            </Field>
            <Field label="Cidade" htmlFor="city" className="sm:col-span-1">
              <Input
                id="city"
                name="city"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                placeholder="São Paulo"
              />
            </Field>
            <Field label="UF" htmlFor="state">
              <NativeSelect
                id="state"
                name="state"
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
              >
                <option value="">—</option>
                {UF.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FieldGroup>

          <FieldGroup columns={3}>
            <Field label="Logradouro" htmlFor="street" className="sm:col-span-2">
              <Input
                id="street"
                name="street"
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
                placeholder="Av. Paulista"
              />
            </Field>
            <Field label="Número" htmlFor="number">
              <Input id="number" name="number" defaultValue={customer?.number ?? ""} placeholder="1000" />
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field label="Bairro" htmlFor="district">
              <Input
                id="district"
                name="district"
                value={address.district}
                onChange={(e) => setAddress({ ...address, district: e.target.value })}
                placeholder="Bela Vista"
              />
            </Field>
            <Field label="Complemento" htmlFor="complement">
              <Input
                id="complement"
                name="complement"
                defaultValue={customer?.complement ?? ""}
                placeholder="Sala 42"
              />
            </Field>
          </FieldGroup>
        </div>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Preferências</p>
          <FieldGroup columns={3}>
            <Field
              label="Dia de vencimento padrão"
              htmlFor="default_due_day"
              hint="Aplicado às novas assinaturas"
            >
              <NativeSelect
                id="default_due_day"
                name="default_due_day"
                defaultValue={customer?.default_due_day ? String(customer.default_due_day) : ""}
              >
                <option value="">Sem padrão</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    Todo dia {day}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Status" htmlFor="status">
              <NativeSelect id="status" name="status" defaultValue={customer?.status ?? "ACTIVE"}>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
                <option value="ARCHIVED">Arquivado</option>
              </NativeSelect>
            </Field>

            <Field label="Site" htmlFor="website">
              <Input
                id="website"
                name="website"
                defaultValue={customer?.website ?? ""}
                placeholder="empresa.com.br"
              />
            </Field>
          </FieldGroup>

          <Field label="Tags" htmlFor="tags" hint="Separe por vírgula: mensalista, prioritário">
            <Input id="tags" name="tags" defaultValue={customer?.tags?.join(", ") ?? ""} />
          </Field>

          <Field label="Observações internas" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={customer?.notes ?? ""}
              placeholder="Anotações visíveis apenas para a equipe"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
