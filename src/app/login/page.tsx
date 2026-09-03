import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Database,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/env";
import { LoginForm, SetupForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

async function countAdmins(): Promise<number | null> {
  try {
    const { count, error } = await db()
      .from("admin_users")
      .select("id", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const session = await getSessionUser();
  if (session) redirect("/dashboard");

  const configured = isDatabaseConfigured();
  const admins = configured ? await countAdmins() : null;
  const needsSetup = configured && admins === 0;
  const schemaMissing = configured && admins === null;

  return (
    <main className="surface-auth flex min-h-dvh flex-col lg:flex-row">
      {/* ---------------------------------------------------------------- form */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[400px] animate-slide-up">
          <Link href="/" className="mb-10 inline-flex">
            <Logo subtitle="Billing Platform" />
          </Link>

          <div className="mb-7 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">
              {needsSetup ? "Configuração inicial" : "Bem-vindo de volta"}
            </h1>
            <p className="text-[14px] leading-relaxed text-ink-500">
              {needsSetup
                ? "Nenhum administrador cadastrado ainda. Crie o acesso de proprietário para começar."
                : "Entre para gerenciar clientes, cobranças e integrações."}
            </p>
          </div>

          {!configured ? (
            <SetupInstructions
              title="Conecte o banco de dados"
              steps={[
                "Crie um projeto em supabase.com (região South America / São Paulo).",
                "Copie a URL do projeto e a chave service_role em Settings → API.",
                "Preencha .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
                "Reinicie o servidor com npm run dev.",
              ]}
            />
          ) : schemaMissing ? (
            <SetupInstructions
              title="Crie as tabelas"
              steps={[
                "Abra o SQL Editor do seu projeto Supabase.",
                "Cole e execute sql/001_schema.sql por inteiro.",
                "Em seguida execute sql/002_functions.sql.",
                "Opcional: execute sql/003_seed.sql para dados de demonstração.",
              ]}
            />
          ) : needsSetup ? (
            <SetupForm />
          ) : (
            <LoginForm />
          )}

          <p className="mt-8 text-center text-[12px] leading-relaxed text-ink-400">
            Ao entrar você concorda com o registro de auditoria de todas as ações
            realizadas no painel.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------ showcase */}
      <aside className="relative hidden overflow-hidden border-l border-ink-200/60 bg-white lg:flex lg:w-[46%] lg:max-w-[620px]">
        <div className="grid-pattern absolute inset-0 opacity-60" aria-hidden />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(600px 400px at 20% 15%, rgb(99 91 255 / 0.10), transparent 60%), radial-gradient(500px 380px at 85% 85%, rgb(0 212 177 / 0.10), transparent 60%)",
          }}
          aria-hidden
        />

        <div className="relative flex flex-col justify-center gap-10 px-14 py-16">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600 ring-1 ring-inset ring-brand-100">
              <Sparkles className="size-3" />
              Payment API
            </span>
            <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink-900">
              Cobre, controle e{" "}
              <span className="text-gradient-brand">bloqueie automaticamente</span> cada
              projeto que você entrega.
            </h2>
            <p className="max-w-md text-[15px] leading-relaxed text-ink-500">
              Uma API por projeto, cobrança recorrente com dia fixo, payment links
              únicos e liberação automática assim que o Pix cai.
            </p>
          </div>

          <ul className="grid gap-3">
            {[
              {
                icon: <Zap />,
                title: "Liberação automática",
                text: "O webhook do Mercado Pago confirma e o projeto volta ao ar sozinho.",
              },
              {
                icon: <KeyRound />,
                title: "Credenciais por projeto",
                text: "API Key e Secret isolados, com escopos, rate limit e IPs permitidos.",
              },
              {
                icon: <Activity />,
                title: "Tudo em tempo real",
                text: "Recebimentos, atrasos e chamadas de API atualizando ao vivo no painel.",
              },
              {
                icon: <ShieldCheck />,
                title: "Webhooks assinados",
                text: "HMAC SHA-256 com retentativa exponencial e replay manual.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="flex gap-3.5 rounded-xl border border-ink-200/80 bg-white/80 p-4 backdrop-blur-sm transition-shadow duration-300 hover:shadow-[var(--shadow-card)]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&_svg]:size-4">
                  {item.icon}
                </span>
                <div className="space-y-0.5">
                  <p className="text-[13.5px] font-semibold text-ink-900">{item.title}</p>
                  <p className="text-[12.5px] leading-relaxed text-ink-500">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-400">
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="size-3.5 text-emerald-500" /> Mercado Pago
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-brand-500" /> Postgres + RLS
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-ink-400" /> Auditoria completa
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}

function SetupInstructions({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/70 p-5 animate-slide-up">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Database className="size-4" />
        </span>
        <p className="text-[14px] font-semibold text-amber-900">{title}</p>
      </div>
      <ol className="space-y-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-[13px] leading-relaxed text-amber-900/90">
            <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="border-t border-amber-200 pt-3 text-[12px] text-amber-800/80">
        Depois disso, atualize esta página para continuar.
      </p>
    </div>
  );
}
