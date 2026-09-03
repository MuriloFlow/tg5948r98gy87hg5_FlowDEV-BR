"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/ui/field";
import { Switch } from "@/components/ui/misc";
import { loginAction, setupAction, type AuthState } from "./actions";
import { checkPasswordStrength } from "./strength";
import { cn } from "@/lib/utils";

const initialState: AuthState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />

      <Field label="E-mail" htmlFor="email" error={state.fieldErrors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="voce@empresa.com.br"
          prefixIcon={<Mail />}
          invalid={Boolean(state.fieldErrors?.email)}
          disabled={pending}
          autoFocus
          required
        />
      </Field>

      <Field
        label="Senha"
        htmlFor="password"
        error={state.fieldErrors?.password}
        required
        action={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="flex items-center gap-1 text-[12px] font-medium text-ink-500 transition-colors hover:text-brand-600"
          >
            {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        }
      >
        <Input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="••••••••••"
          prefixIcon={<Lock />}
          invalid={Boolean(state.fieldErrors?.password)}
          disabled={pending}
          required
        />
      </Field>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-600">
          <Switch
            checked={remember}
            onCheckedChange={setRemember}
            disabled={pending}
            name="remember-switch"
          />
          Manter conectado por 30 dias
        </label>
        <input type="checkbox" name="remember" checked={remember} readOnly hidden />
      </div>

      <Button type="submit" size="lg" block loading={pending} icon={<LogIn />}>
        {pending ? "Entrando..." : "Entrar no painel"}
      </Button>

      <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[12px] text-ink-400">
        <ShieldCheck className="size-3.5" />
        Sessão criptografada · bloqueio após 6 tentativas
      </p>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, initialState);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const strength = checkPasswordStrength(password);

  const bars = ["Muito fraca", "Fraca", "Razoável", "Boa", "Excelente"];
  const colors = ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />

      <Field label="Seu nome" htmlFor="name" error={state.fieldErrors?.name} required>
        <Input
          id="name"
          name="name"
          placeholder="Murilo Silva"
          prefixIcon={<User />}
          invalid={Boolean(state.fieldErrors?.name)}
          disabled={pending}
          autoFocus
          required
        />
      </Field>

      <Field label="E-mail de acesso" htmlFor="setup-email" error={state.fieldErrors?.email} required>
        <Input
          id="setup-email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="voce@empresa.com.br"
          prefixIcon={<Mail />}
          invalid={Boolean(state.fieldErrors?.email)}
          disabled={pending}
          required
        />
      </Field>

      <Field
        label="Senha"
        htmlFor="setup-password"
        error={state.fieldErrors?.password}
        required
        action={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="flex items-center gap-1 text-[12px] font-medium text-ink-500 transition-colors hover:text-brand-600"
          >
            {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        }
      >
        <Input
          id="setup-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Mínimo de 10 caracteres"
          prefixIcon={<Lock />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={Boolean(state.fieldErrors?.password)}
          disabled={pending}
          required
        />
      </Field>

      {password.length > 0 && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  i < strength.score ? colors[strength.score] : "bg-ink-200"
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-ink-500">
            Força da senha: <span className="font-medium">{bars[strength.score]}</span>
            {strength.issues[0] && ` · ${strength.issues[0]}`}
          </p>
        </div>
      )}

      <Field label="Confirmar senha" htmlFor="confirm" error={state.fieldErrors?.confirm} required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a senha"
          prefixIcon={<Lock />}
          invalid={Boolean(state.fieldErrors?.confirm)}
          disabled={pending}
          required
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending} icon={<ShieldCheck />}>
        {pending ? "Criando acesso..." : "Criar acesso de proprietário"}
      </Button>
    </form>
  );
}
