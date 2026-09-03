"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Check,
  LogOut,
  Monitor,
  Palette,
  Receipt,
  Save,
  ShieldCheck,
  Smartphone,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormError } from "@/components/ui/field";
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import {
  changeOwnPasswordAction,
  revokeOtherOwnSessionsAction,
  updateOwnPreferencesAction,
  updateOwnProfileAction,
} from "@/server/team";
import { upsertSettingAction } from "@/server/settings";
import type { ActionResult } from "@/server/action-utils";
import { checkPasswordStrength } from "@/app/login/strength";
import { ADMIN_ROLE, PAYMENT_METHOD } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { AdminRole, AdminUser, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ tipos -- */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  timezone: string;
  role: AdminRole;
  two_factor_enabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  preferences: { table_density: string; home_page: string };
}

export interface CompanyProfile {
  legal_name: string;
  trade_name: string;
  document: string;
  email: string;
  phone: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  logo_url: string;
  statement_descriptor: string;
  description: string;
}

export interface BillingDefaults {
  grace_days: number;
  due_day: number;
  payment_methods: PaymentMethod[];
  max_installments: number;
  late_fee_percent: number;
  interest_percent_month: number;
  expires_after_days: number;
}

export interface SessionRow {
  id: string;
  ip: string | null;
  user_agent: string | null;
  last_seen_at: string;
  created_at: string;
  expires_at: string;
}

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
];

const HOME_PAGES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/tempo-real", label: "Tempo real" },
  { value: "/cobrancas", label: "Cobranças" },
  { value: "/inadimplencia", label: "Inadimplência" },
  { value: "/clientes", label: "Clientes" },
  { value: "/metricas", label: "Métricas" },
];

const METHOD_OPTIONS: PaymentMethod[] = ["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"];

const UF = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

/** Rótulo legível para a sessão a partir do user agent. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconhecido";
  const browser = /Edg/.test(userAgent)
    ? "Edge"
    : /OPR|Opera/.test(userAgent)
      ? "Opera"
      : /Chrome/.test(userAgent)
        ? "Chrome"
        : /Safari/.test(userAgent)
          ? "Safari"
          : /Firefox/.test(userAgent)
            ? "Firefox"
            : "Navegador";

  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Sistema desconhecido";

  return `${browser} · ${system}`;
}

function isMobile(userAgent: string | null): boolean {
  return Boolean(userAgent && /Android|iPhone|iPad|Mobile/.test(userAgent));
}

/* ------------------------------------------------------------------ raiz --- */

export function SettingsClient({
  profile,
  company,
  billing,
  sessions,
  currentSessionId,
  canManageSettings,
}: {
  profile: UserProfile;
  company: CompanyProfile;
  billing: BillingDefaults;
  sessions: SessionRow[];
  currentSessionId: string;
  canManageSettings: boolean;
}) {
  return (
    <Tabs defaultValue="perfil">
      <TabsList>
        <TabsTrigger value="perfil">Perfil</TabsTrigger>
        <TabsTrigger value="empresa">Empresa</TabsTrigger>
        <TabsTrigger value="cobranca">Cobrança</TabsTrigger>
        <TabsTrigger value="seguranca">Segurança</TabsTrigger>
        <TabsTrigger value="aparencia">Aparência</TabsTrigger>
      </TabsList>

      <TabsContent value="perfil">
        <ProfileTab profile={profile} />
      </TabsContent>

      <TabsContent value="empresa">
        <CompanyTab company={company} canManage={canManageSettings} />
      </TabsContent>

      <TabsContent value="cobranca">
        <BillingTab billing={billing} canManage={canManageSettings} />
      </TabsContent>

      <TabsContent value="seguranca">
        <SecurityTab sessions={sessions} currentSessionId={currentSessionId} />
      </TabsContent>

      <TabsContent value="aparencia">
        <AppearanceTab preferences={profile.preferences} />
      </TabsContent>
    </Tabs>
  );
}

/* ---------------------------------------------------------------- perfil --- */

function ProfileTab({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = React.useState<string | null>(null);
  const [avatarFileName, setAvatarFileName] = React.useState<string | null>(null);
  const avatarPreview = pendingAvatarPreview ?? profile.avatar_url;

  const [profileState, profileAction, profilePending] = useActionState<
    ActionResult<AdminUser> | null,
    FormData
  >(updateOwnProfileAction, null);

  // a troca de senha não usa useActionState porque precisamos limpar os campos
  // logo após o sucesso, o que é mais direto no próprio callback do submit
  const [passwordState, setPasswordState] = React.useState<ActionResult | null>(null);
  const [passwordPending, startPasswordSubmit] = React.useTransition();
  const [password, setPassword] = React.useState("");
  const strength = checkPasswordStrength(password);

  const formRef = React.useRef<HTMLFormElement>(null);

  function passwordAction(formData: FormData) {
    startPasswordSubmit(async () => {
      const result = await changeOwnPasswordAction(null, formData);
      setPasswordState(result);

      if (result.ok) {
        toast.success(result.message ?? "Senha alterada");
        setPassword("");
        formRef.current?.reset();
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  React.useEffect(() => {
    if (profileState?.ok) {
      toast.success(profileState.message ?? "Perfil atualizado");
      setTimeout(() => {
        setPendingAvatarPreview(null);
        setAvatarFileName(null);
      }, 0);
      router.refresh();
    } else if (profileState?.error) {
      toast.error(profileState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileState]);

  React.useEffect(() => {
    return () => {
      if (pendingAvatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
    };
  }, [pendingAvatarPreview]);

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      event.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (JPG, PNG, WebP ou GIF).");
      event.target.value = "";
      return;
    }

    setPendingAvatarPreview(URL.createObjectURL(file));
    setAvatarFileName(file.name);
  }

  function clearAvatarSelection() {
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    if (pendingAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }
    setPendingAvatarPreview(null);
    setAvatarFileName(null);
  }

  const profileErrors = profileState?.fieldErrors ?? {};
  const passwordErrors = passwordState?.fieldErrors ?? {};

  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar name={profile.name} src={avatarPreview} size="lg" />
            <div className="space-y-1">
              <CardTitle>{profile.name}</CardTitle>
              <div className="flex items-center gap-2">
                <StatusBadge meta={ADMIN_ROLE[profile.role]} size="sm" />
                {profile.last_login_at && (
                  <span className="text-[11.5px] text-ink-400">
                    último acesso {formatRelative(profile.last_login_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form action={profileAction} className="space-y-5">
            <FormError message={profileState?.error} />

            <Field
              label="Foto de perfil"
              htmlFor="avatar"
              error={profileErrors.avatar}
              hint="JPG, PNG, WebP ou GIF · até 2 MB"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={avatarInputRef}
                  id="avatar"
                  name="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={onAvatarChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Upload />}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  Escolher imagem
                </Button>
                {avatarFileName && (
                  <>
                    <span className="max-w-[220px] truncate text-[12.5px] text-ink-600">
                      {avatarFileName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<X />}
                      onClick={clearAvatarSelection}
                    >
                      Remover seleção
                    </Button>
                  </>
                )}
              </div>
            </Field>

            <FieldGroup>
              <Field label="Nome" htmlFor="name" error={profileErrors.name} required>
                <Input id="name" name="name" defaultValue={profile.name} required />
              </Field>

              <Field label="E-mail" htmlFor="email" hint="O e-mail de acesso não pode ser alterado aqui">
                <Input id="email" value={profile.email} readOnly disabled />
              </Field>

              <Field label="Telefone" htmlFor="phone" error={profileErrors.phone}>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={profile.phone ?? ""}
                  placeholder="(11) 90000-0000"
                />
              </Field>

              <Field label="Fuso horário" htmlFor="timezone" error={profileErrors.timezone}>
                <NativeSelect id="timezone" name="timezone" defaultValue={profile.timezone}>
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replace("America/", "").replace(/_/g, " ")}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FieldGroup>

            <div className="flex justify-end">
              <Button type="submit" loading={profilePending} icon={<Save />}>
                Salvar perfil
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Trocar senha</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              As demais sessões são encerradas por segurança
            </p>
          </div>
          {profile.must_change_password && (
            <Badge tone="warning" size="sm">
              troca obrigatória
            </Badge>
          )}
        </CardHeader>

        <CardContent>
          <form ref={formRef} action={passwordAction} className="space-y-5">
            <FormError message={passwordState?.error} />

            <Field
              label="Senha atual"
              htmlFor="current_password"
              error={passwordErrors.current_password}
              required
            >
              <Input
                id="current_password"
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>

            <Field
              label="Nova senha"
              htmlFor="new_password"
              error={passwordErrors.new_password}
              required
            >
              <Input
                id="new_password"
                name="new_password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>

            {password.length > 0 && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors duration-300",
                        index < strength.score
                          ? strength.score <= 1
                            ? "bg-rose-500"
                            : strength.score === 2
                              ? "bg-amber-500"
                              : strength.score === 3
                                ? "bg-sky-500"
                                : "bg-emerald-500"
                          : "bg-ink-200"
                      )}
                    />
                  ))}
                </div>
                {strength.issues.length > 0 ? (
                  <ul className="space-y-0.5">
                    {strength.issues.map((issue) => (
                      <li key={issue} className="text-[11.5px] text-ink-500">
                        · {issue}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-600">
                    <Check className="size-3.5" />
                    Senha forte
                  </p>
                )}
              </div>
            )}

            <Field
              label="Confirmar nova senha"
              htmlFor="confirm_password"
              error={passwordErrors.confirm_password}
              required
            >
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>

            <div className="flex justify-end">
              <Button
                type="submit"
                loading={passwordPending}
                disabled={!strength.ok}
                icon={<ShieldCheck />}
              >
                Alterar senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- empresa --- */

function CompanyTab({
  company,
  canManage,
}: {
  company: CompanyProfile;
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<CompanyProfile>(company);
  const [saving, setSaving] = React.useState(false);

  function update<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const result = await upsertSettingAction("company_profile", form);
    setSaving(false);

    if (result.ok) {
      toast.success("Dados do emissor salvos.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Building2 className="size-4.5" />
          </span>
          <div className="space-y-0.5">
            <CardTitle>Dados do emissor</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              Aparecem nas cobranças, no checkout e nos e-mails enviados ao cliente
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!canManage && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800">
            Seu papel permite consultar estes dados, mas não alterá-los.
          </p>
        )}

        <FieldGroup>
          <Field label="Razão social" htmlFor="legal_name" required>
            <Input
              id="legal_name"
              value={form.legal_name}
              onChange={(event) => update("legal_name", event.target.value)}
              placeholder="FlowDesk Tecnologia LTDA"
              disabled={!canManage}
            />
          </Field>

          <Field label="Nome fantasia" htmlFor="trade_name">
            <Input
              id="trade_name"
              value={form.trade_name}
              onChange={(event) => update("trade_name", event.target.value)}
              placeholder="FlowDesk"
              disabled={!canManage}
            />
          </Field>

          <Field label="CNPJ" htmlFor="document">
            <Input
              id="document"
              value={form.document}
              onChange={(event) => update("document", event.target.value)}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              disabled={!canManage}
            />
          </Field>

          <Field
            label="E-mail de cobrança"
            htmlFor="billing_email"
            hint="Remetente e resposta das mensagens de cobrança"
          >
            <Input
              id="billing_email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="financeiro@suaempresa.com.br"
              disabled={!canManage}
            />
          </Field>

          <Field label="Telefone" htmlFor="company_phone">
            <Input
              id="company_phone"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="(11) 3000-0000"
              disabled={!canManage}
            />
          </Field>

          <Field
            label="Descrição no extrato do cartão"
            htmlFor="statement_descriptor"
            hint="Até 22 caracteres, sem acentos"
          >
            <Input
              id="statement_descriptor"
              value={form.statement_descriptor}
              onChange={(event) =>
                update("statement_descriptor", event.target.value.toUpperCase().slice(0, 22))
              }
              placeholder="FLOWDESK"
              disabled={!canManage}
            />
          </Field>
        </FieldGroup>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-semibold text-ink-800">Endereço</p>

          <FieldGroup columns={3}>
            <Field label="CEP" htmlFor="zip_code">
              <Input
                id="zip_code"
                value={form.zip_code}
                onChange={(event) => update("zip_code", event.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
                disabled={!canManage}
              />
            </Field>
            <Field label="Cidade" htmlFor="city">
              <Input
                id="city"
                value={form.city}
                onChange={(event) => update("city", event.target.value)}
                placeholder="São Paulo"
                disabled={!canManage}
              />
            </Field>
            <Field label="UF" htmlFor="state">
              <NativeSelect
                id="state"
                value={form.state}
                onChange={(event) => update("state", event.target.value)}
                disabled={!canManage}
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
                value={form.street}
                onChange={(event) => update("street", event.target.value)}
                placeholder="Av. Paulista"
                disabled={!canManage}
              />
            </Field>
            <Field label="Número" htmlFor="number">
              <Input
                id="number"
                value={form.number}
                onChange={(event) => update("number", event.target.value)}
                placeholder="1000"
                disabled={!canManage}
              />
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field label="Bairro" htmlFor="district">
              <Input
                id="district"
                value={form.district}
                onChange={(event) => update("district", event.target.value)}
                placeholder="Bela Vista"
                disabled={!canManage}
              />
            </Field>
            <Field label="Complemento" htmlFor="complement">
              <Input
                id="complement"
                value={form.complement}
                onChange={(event) => update("complement", event.target.value)}
                placeholder="Sala 42"
                disabled={!canManage}
              />
            </Field>
          </FieldGroup>
        </div>

        <div className="space-y-4 border-t border-ink-200 pt-5">
          <Field label="Logo (URL)" htmlFor="logo_url" hint="Usada no checkout e nos PDFs">
            <Input
              id="logo_url"
              value={form.logo_url}
              onChange={(event) => update("logo_url", event.target.value)}
              placeholder="https://..."
              disabled={!canManage}
            />
          </Field>

          <Field label="Descrição da empresa" htmlFor="description">
            <Textarea
              id="description"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Texto curto exibido nas comunicações de cobrança"
              disabled={!canManage}
            />
          </Field>
        </div>

        {canManage && (
          <div className="flex justify-end border-t border-ink-200 pt-5">
            <Button onClick={() => void save()} loading={saving} icon={<Save />}>
              Salvar dados da empresa
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- cobrança --- */

function BillingTab({
  billing,
  canManage,
}: {
  billing: BillingDefaults;
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<BillingDefaults>(billing);
  const [saving, setSaving] = React.useState(false);

  function update<K extends keyof BillingDefaults>(key: K, value: BillingDefaults[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleMethod(method: PaymentMethod) {
    setForm((current) => ({
      ...current,
      payment_methods: current.payment_methods.includes(method)
        ? current.payment_methods.filter((item) => item !== method)
        : [...current.payment_methods, method],
    }));
  }

  async function save() {
    if (form.payment_methods.length === 0) {
      toast.error("Selecione ao menos um método de pagamento.");
      return;
    }

    setSaving(true);
    const result = await upsertSettingAction("billing_defaults", form);
    setSaving(false);

    if (result.ok) {
      toast.success("Padrões de cobrança salvos.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Receipt className="size-4.5" />
          </span>
          <div className="space-y-0.5">
            <CardTitle>Padrões de cobrança</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              Aplicados automaticamente a novas assinaturas e faturas
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!canManage && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800">
            Seu papel permite consultar estes padrões, mas não alterá-los.
          </p>
        )}

        <FieldGroup columns={3}>
          <Field
            label="Dias de carência padrão"
            htmlFor="grace_days"
            hint="Prazo após o vencimento antes do bloqueio"
          >
            <Input
              id="grace_days"
              type="number"
              min={0}
              max={90}
              value={form.grace_days}
              onChange={(event) => update("grace_days", Number(event.target.value))}
              disabled={!canManage}
            />
          </Field>

          <Field label="Dia de vencimento padrão" htmlFor="due_day">
            <NativeSelect
              id="due_day"
              value={String(form.due_day)}
              onChange={(event) => update("due_day", Number(event.target.value))}
              disabled={!canManage}
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Todo dia {day}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Parcelamento máximo" htmlFor="max_installments">
            <NativeSelect
              id="max_installments"
              value={String(form.max_installments)}
              onChange={(event) => update("max_installments", Number(event.target.value))}
              disabled={!canManage}
            >
              {Array.from({ length: 24 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Multa por atraso (%)" htmlFor="late_fee_percent">
            <Input
              id="late_fee_percent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={form.late_fee_percent}
              onChange={(event) => update("late_fee_percent", Number(event.target.value))}
              disabled={!canManage}
            />
          </Field>

          <Field label="Juros ao mês (%)" htmlFor="interest_percent_month">
            <Input
              id="interest_percent_month"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={form.interest_percent_month}
              onChange={(event) => update("interest_percent_month", Number(event.target.value))}
              disabled={!canManage}
            />
          </Field>

          <Field
            label="Dias para expirar"
            htmlFor="expires_after_days"
            hint="Depois disso a cobrança vira EXPIRADA"
          >
            <Input
              id="expires_after_days"
              type="number"
              min={1}
              max={365}
              value={form.expires_after_days}
              onChange={(event) => update("expires_after_days", Number(event.target.value))}
              disabled={!canManage}
            />
          </Field>
        </FieldGroup>

        <div className="space-y-2.5 border-t border-ink-200 pt-5">
          <p className="text-[13px] font-medium text-ink-700">Métodos de pagamento padrão</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {METHOD_OPTIONS.map((method) => {
              const active = form.payment_methods.includes(method);
              return (
                <label
                  key={method}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-150",
                    active
                      ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
                      : "border-ink-200 hover:border-ink-300",
                    !canManage && "pointer-events-none opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={active}
                    onChange={() => toggleMethod(method)}
                    disabled={!canManage}
                  />
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded border",
                      active ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300"
                    )}
                  >
                    {active && <Check className="size-3" />}
                  </span>
                  <span className="text-[13px] text-ink-800">{PAYMENT_METHOD[method].label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end border-t border-ink-200 pt-5">
            <Button onClick={() => void save()} loading={saving} icon={<Save />}>
              Salvar padrões
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- segurança --- */

function SecurityTab({
  sessions,
  currentSessionId,
}: {
  sessions: SessionRow[];
  currentSessionId: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const others = sessions.filter((session) => session.id !== currentSessionId);

  async function revokeOthers() {
    setBusy(true);
    const result = await revokeOtherOwnSessionsAction();
    setBusy(false);

    if (result.ok) {
      toast.success(result.message ?? "Sessões encerradas");
      setConfirmOpen(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível encerrar as sessões");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <ShieldCheck className="size-4.5" />
            </span>
            <div className="space-y-0.5">
              <CardTitle>Sessões ativas</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                {sessions.length} {sessions.length === 1 ? "dispositivo conectado" : "dispositivos conectados"}
              </p>
            </div>
          </div>
          {others.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<LogOut />}
              onClick={() => setConfirmOpen(true)}
            >
              Encerrar outras sessões
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              Nenhuma sessão ativa registrada.
            </p>
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {sessions.map((session) => {
                const current = session.id === currentSessionId;
                return (
                  <li key={session.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                      {isMobile(session.user_agent) ? (
                        <Smartphone className="size-4" />
                      ) : (
                        <Monitor className="size-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium text-ink-900">
                          {deviceLabel(session.user_agent)}
                        </p>
                        {current && (
                          <Badge tone="success" size="sm" dot>
                            esta sessão
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[11.5px] text-ink-500">
                        {session.ip ?? "IP desconhecido"} · ativa {formatRelative(session.last_seen_at)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[11.5px] text-ink-500">
                        entrou em {formatDateTime(session.created_at)}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        expira {formatRelative(session.expires_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Encerrar as outras sessões?"
        description={`${others.length} sessão(ões) além desta serão desconectadas imediatamente. Você permanece conectado neste dispositivo.`}
        confirmLabel="Encerrar sessões"
        loading={busy}
        onConfirm={revokeOthers}
      />
    </>
  );
}

/* -------------------------------------------------------------- aparência -- */

function AppearanceTab({
  preferences,
}: {
  preferences: { table_density: string; home_page: string };
}) {
  const router = useRouter();
  const [density, setDensity] = React.useState(preferences.table_density);
  const [homePage, setHomePage] = React.useState(preferences.home_page);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const result = await updateOwnPreferencesAction({
      table_density: density,
      home_page: homePage,
    });
    setSaving(false);

    if (result.ok) {
      toast.success(result.message ?? "Preferências salvas");
      router.refresh();
    } else {
      toast.error(result.error ?? "Não foi possível salvar");
    }
  }

  const densities = [
    { value: "compact", label: "Compacta", hint: "Mais linhas visíveis por tela" },
    { value: "comfortable", label: "Confortável", hint: "Espaçamento padrão do painel" },
    { value: "relaxed", label: "Espaçada", hint: "Leitura mais folgada" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Palette className="size-4.5" />
          </span>
          <div className="space-y-0.5">
            <CardTitle>Aparência</CardTitle>
            <p className="text-[12.5px] text-ink-500">Preferências salvas na sua conta</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2.5">
          <p className="text-[13px] font-medium text-ink-700">Densidade das tabelas</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {densities.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer space-y-0.5 rounded-lg border px-3.5 py-3 transition-all duration-150",
                  density === option.value
                    ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
                    : "border-ink-200 hover:border-ink-300"
                )}
              >
                <input
                  type="radio"
                  name="density"
                  className="sr-only"
                  value={option.value}
                  checked={density === option.value}
                  onChange={() => setDensity(option.value)}
                />
                <span className="block text-[13px] font-medium text-ink-900">{option.label}</span>
                <span className="block text-[11.5px] text-ink-500">{option.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-ink-200 pt-5">
          <Field
            label="Página inicial preferida"
            htmlFor="home_page"
            hint="Tela aberta ao entrar no painel"
            className="max-w-sm"
          >
            <NativeSelect
              id="home_page"
              value={homePage}
              onChange={(event) => setHomePage(event.target.value)}
            >
              {HOME_PAGES.map((page) => (
                <option key={page.value} value={page.value}>
                  {page.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-200 pt-5">
          <p className="flex items-center gap-2 text-[12px] text-ink-500">
            <UserCog className="size-3.5" />
            As preferências valem apenas para a sua conta.
          </p>
          <Button onClick={() => void save()} loading={saving} icon={<Save />}>
            Salvar preferências
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
