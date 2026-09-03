"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, MoreHorizontal, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Avatar } from "@/components/ui/misc";
import { DataToolbar } from "@/components/panel/toolbar";
import {
  createCompanyAction,
  deleteCompanyAction,
  updateCompanyAction,
} from "@/server/finance-extra";
import type { ActionResult } from "@/server/action-utils";
import { ENTITY_STATUS } from "@/lib/labels";
import { formatDocument, formatPhone } from "@/lib/format";
import type { EntityStatus } from "@/lib/types";

export interface CustomerOption {
  id: string;
  name: string;
  legal_name: string | null;
  code: string;
}

export interface CompanyRow {
  id: string;
  customer_id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  status: EntityStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
}

const UF = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function CompaniesClient({
  companies,
  customers,
  canWrite,
}: {
  companies: CompanyRow[];
  customers: CustomerOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CompanyRow | null>(null);
  const [confirm, setConfirm] = React.useState<CompanyRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  async function runDelete() {
    if (!confirm) return;
    setBusy(true);
    const result = await deleteCompanyAction(confirm.id);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Empresa excluída");
      setConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível excluir");
    }
  }

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por razão social, nome fantasia ou CNPJ..."
        filters={[
          {
            key: "cliente",
            label: "Cliente",
            options: customers.map((customer) => ({
              value: customer.id,
              label: customer.legal_name || customer.name,
            })),
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ACTIVE", label: "Ativa" },
              { value: "INACTIVE", label: "Inativa" },
              { value: "ARCHIVED", label: "Arquivada" },
            ],
          },
        ]}
        right={
          canWrite && (
            <Button size="sm" icon={<Plus />} onClick={openCreate}>
              Nova empresa
            </Button>
          )
        }
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Empresa</TH>
              <TH>CNPJ</TH>
              <TH>Cliente</TH>
              <TH>Contato</TH>
              <TH>Cidade</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {companies.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<Building2 />}
                title="Nenhuma empresa cadastrada"
                description="Cadastre a pessoa jurídica de um cliente para usá-la como emissora em projetos e notas."
                action={
                  canWrite && (
                    <Button size="sm" icon={<Plus />} onClick={openCreate}>
                      Cadastrar empresa
                    </Button>
                  )
                }
              />
            ) : (
              companies.map((company) => (
                <TR key={company.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={company.legal_name} src={company.logo_url} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-900">
                          {company.legal_name}
                        </span>
                        {company.trade_name && (
                          <span className="block truncate text-[11.5px] text-ink-400">
                            {company.trade_name}
                          </span>
                        )}
                      </span>
                    </div>
                  </TD>
                  <TD className="font-mono text-[12px]">{formatDocument(company.cnpj)}</TD>
                  <TD>
                    <span className="block max-w-[170px] truncate text-[12.5px]">
                      {company.customer_name ?? "—"}
                    </span>
                  </TD>
                  <TD>
                    <span className="block truncate text-[12.5px]">{company.email ?? "—"}</span>
                    {company.phone && (
                      <span className="block text-[11.5px] text-ink-400">
                        {formatPhone(company.phone)}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {company.city ? (
                      <span className="text-[12.5px]">
                        {company.city}
                        {company.state ? `/${company.state}` : ""}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge meta={ENTITY_STATUS[company.status]} size="sm" />
                  </TD>
                  <TD>
                    {canWrite && (
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="iconXs" aria-label="Ações da empresa">
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            icon={<Pencil />}
                            onSelect={() => {
                              setEditing(company);
                              setFormOpen(true);
                            }}
                          >
                            Editar empresa
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            icon={<Trash2 />}
                            destructive
                            onSelect={() => setConfirm(company)}
                          >
                            Excluir
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>

      {formOpen && (
        <CompanyForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          company={editing}
          customers={customers}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Excluir ${confirm.legal_name}?` : ""}
        description="A exclusão só é permitida para empresas sem projetos vinculados."
        confirmLabel="Excluir empresa"
        destructive
        loading={busy}
        onConfirm={runDelete}
      />
    </>
  );
}

function CompanyForm({
  open,
  onOpenChange,
  company,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyRow | null;
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const editing = Boolean(company);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    editing ? updateCompanyAction : createCompanyAction,
    null
  );

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Empresa salva");
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
      title={editing ? `Editar ${company?.legal_name}` : "Nova empresa"}
      description="A empresa pertence a um cliente e pode ser vinculada aos projetos dele."
      size="lg"
      icon={<Building2 />}
      locked={pending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="company-form" loading={pending} icon={<Save />}>
            {editing ? "Salvar alterações" : "Cadastrar empresa"}
          </Button>
        </>
      }
    >
      <form id="company-form" action={formAction} className="space-y-6">
        {editing && <input type="hidden" name="id" value={company!.id} />}

        <FormError message={state?.error} />

        <FieldGroup>
          <Field label="Cliente" htmlFor="customer_id" error={errors.customer_id} required>
            <NativeSelect
              id="customer_id"
              name="customer_id"
              defaultValue={company?.customer_id ?? ""}
              required
            >
              <option value="">Selecione o cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.legal_name || customer.name} · {customer.code}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={company?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
              <option value="ARCHIVED">Arquivada</option>
            </NativeSelect>
          </Field>

          <Field label="Razão social" htmlFor="legal_name" error={errors.legal_name} required>
            <Input
              id="legal_name"
              name="legal_name"
              defaultValue={company?.legal_name}
              placeholder="Mecânica Total Flex LTDA"
              required
            />
          </Field>

          <Field label="Nome fantasia" htmlFor="trade_name" error={errors.trade_name}>
            <Input
              id="trade_name"
              name="trade_name"
              defaultValue={company?.trade_name ?? ""}
              placeholder="Total Flex"
            />
          </Field>

          <Field label="CNPJ" htmlFor="cnpj" error={errors.cnpj}>
            <Input
              id="cnpj"
              name="cnpj"
              defaultValue={company?.cnpj ?? ""}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
          </Field>

          <Field
            label="Inscrição estadual"
            htmlFor="state_registration"
            error={errors.state_registration}
            hint="Informe ISENTO quando não houver"
          >
            <Input
              id="state_registration"
              name="state_registration"
              defaultValue={company?.state_registration ?? ""}
              placeholder="123.456.789.000"
            />
          </Field>
        </FieldGroup>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Contato</p>

          <FieldGroup columns={3}>
            <Field label="E-mail" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={company?.email ?? ""}
                placeholder="contato@empresa.com.br"
              />
            </Field>
            <Field label="Telefone" htmlFor="phone" error={errors.phone}>
              <Input
                id="phone"
                name="phone"
                defaultValue={company?.phone ?? ""}
                placeholder="(11) 3000-0000"
              />
            </Field>
            <Field label="Site" htmlFor="website" error={errors.website}>
              <Input
                id="website"
                name="website"
                defaultValue={company?.website ?? ""}
                placeholder="empresa.com.br"
              />
            </Field>
          </FieldGroup>

          <Field label="Inscrição municipal" htmlFor="municipal_registration">
            <Input
              id="municipal_registration"
              name="municipal_registration"
              defaultValue={company?.municipal_registration ?? ""}
            />
          </Field>
        </div>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Endereço</p>

          <FieldGroup columns={3}>
            <Field label="CEP" htmlFor="zip_code">
              <Input
                id="zip_code"
                name="zip_code"
                defaultValue={company?.zip_code ?? ""}
                placeholder="00000-000"
                inputMode="numeric"
              />
            </Field>
            <Field label="Cidade" htmlFor="city">
              <Input
                id="city"
                name="city"
                defaultValue={company?.city ?? ""}
                placeholder="São Paulo"
              />
            </Field>
            <Field label="UF" htmlFor="state">
              <NativeSelect id="state" name="state" defaultValue={company?.state ?? ""}>
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
                defaultValue={company?.street ?? ""}
                placeholder="Av. Paulista"
              />
            </Field>
            <Field label="Número" htmlFor="number">
              <Input
                id="number"
                name="number"
                defaultValue={company?.number ?? ""}
                placeholder="1000"
              />
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field label="Bairro" htmlFor="district">
              <Input
                id="district"
                name="district"
                defaultValue={company?.district ?? ""}
                placeholder="Bela Vista"
              />
            </Field>
            <Field label="Complemento" htmlFor="complement">
              <Input
                id="complement"
                name="complement"
                defaultValue={company?.complement ?? ""}
                placeholder="Sala 42"
              />
            </Field>
          </FieldGroup>
        </div>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <Field label="Logo (URL)" htmlFor="logo_url" hint="Aparece no checkout e nos documentos">
            <Input
              id="logo_url"
              name="logo_url"
              defaultValue={company?.logo_url ?? ""}
              placeholder="https://..."
            />
          </Field>

          <Field label="Observações internas" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={company?.notes ?? ""}
              placeholder="Anotações visíveis apenas para a equipe"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
