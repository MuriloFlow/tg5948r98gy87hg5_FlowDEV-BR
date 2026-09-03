import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { db } from "@/lib/db";
import { isMercadoPagoConfigured } from "@/lib/env";
import { formatCurrency, formatDateLong } from "@/lib/format";
import type { Customer, Invoice, PaymentLink, Project } from "@/lib/types";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  try {
    const { data } = await db()
      .from("payment_links")
      .select("title, amount")
      .eq("token", token)
      .maybeSingle();
    if (!data) return { title: "Pagamento" };
    return {
      title: `${data.title} · ${formatCurrency(Number(data.amount))}`,
      description: "Pagamento seguro processado pelo Mercado Pago.",
    };
  } catch {
    return { title: "Pagamento" };
  }
}

async function loadLink(token: string) {
  try {
    const { data } = await db()
      .from("payment_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!data) return null;
    const link = data as PaymentLink;

    const [{ data: project }, { data: customer }, { data: invoice }] = await Promise.all([
      db().from("projects").select("*").eq("id", link.project_id).maybeSingle(),
      db().from("customers").select("*").eq("id", link.customer_id).maybeSingle(),
      link.invoice_id
        ? db().from("invoices").select("*").eq("id", link.invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // telemetria de visualização (não bloqueia a renderização)
    void db()
      .from("payment_links")
      .update({
        view_count: link.view_count + 1,
        last_viewed_at: new Date().toISOString(),
        first_viewed_at: link.first_viewed_at ?? new Date().toISOString(),
      })
      .eq("id", link.id)
      .then(() => undefined, () => undefined);

    return {
      link,
      project: project as Project | null,
      customer: customer as Customer | null,
      invoice: invoice as Invoice | null,
    };
  } catch {
    return null;
  }
}

export default async function PayPage({ params }: PageProps) {
  const { token } = await params;
  const context = await loadLink(token);

  if (!context) notFound();

  const { link, project, customer, invoice } = context;
  const expired = link.expires_at ? new Date(link.expires_at) < new Date() : false;
  const alreadyPaid = link.status === "PAID" || invoice?.status === "PAID";
  const disabled = link.status === "DISABLED";
  const gatewayReady = isMercadoPagoConfigured();

  return (
    <main className="surface-auth min-h-dvh px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[520px]">
        <header className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink-900">
            FlowDesk
          </span>
        </header>

        {alreadyPaid ? (
          <StatusCard
            tone="success"
            title="Pagamento já confirmado"
            description={`Recebemos o pagamento de ${formatCurrency(link.amount)}. Não é necessário pagar novamente.`}
          />
        ) : disabled ? (
          <StatusCard
            tone="neutral"
            title="Link desativado"
            description="Este link de pagamento foi desativado. Solicite um novo ao responsável pela cobrança."
          />
        ) : expired ? (
          <StatusCard
            tone="danger"
            title="Link expirado"
            description={`Este link venceu em ${formatDateLong(link.expires_at)}. Peça a emissão de um novo link para concluir o pagamento.`}
          />
        ) : (
          <Checkout
            token={link.token}
            title={link.title}
            description={link.description}
            amount={Number(link.amount)}
            methods={link.payment_methods}
            maxInstallments={link.max_installments}
            checkoutUrl={link.checkout_url}
            gatewayReady={gatewayReady}
            dueDate={invoice?.due_date ?? null}
            invoiceCode={invoice?.code ?? null}
            projectName={project?.name ?? null}
            customerName={customer?.name ?? null}
            customerEmail={customer?.email ?? null}
            customerDocument={customer?.document ?? null}
            blocksAccess={Boolean(invoice?.is_mandatory) && project?.status === "BLOCKED_PAYMENT"}
          />
        )}

        <footer className="mt-6 space-y-3 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-400">
            <ShieldCheck className="size-3.5" />
            Pagamento processado com segurança pelo Mercado Pago
          </p>
          <p className="text-[11.5px] text-ink-400">
            Em caso de dúvida, responda o e-mail da cobrança ou fale com o responsável pelo
            projeto.
          </p>
        </footer>
      </div>
    </main>
  );
}

function StatusCard({
  tone,
  title,
  description,
}: {
  tone: "success" | "danger" | "neutral";
  title: string;
  description: string;
}) {
  const styles = {
    success: { wrap: "border-emerald-200", icon: "bg-emerald-50 text-emerald-600", node: <ShieldCheck /> },
    danger: { wrap: "border-rose-200", icon: "bg-rose-50 text-rose-600", node: <AlertTriangle /> },
    neutral: { wrap: "border-ink-200", icon: "bg-ink-100 text-ink-500", node: <Clock /> },
  }[tone];

  return (
    <div
      className={`rounded-2xl border bg-white p-8 text-center shadow-[var(--shadow-raised)] animate-slide-up ${styles.wrap}`}
    >
      <span
        className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl [&_svg]:size-5 ${styles.icon}`}
      >
        {styles.node}
      </span>
      <h1 className="text-[18px] font-semibold tracking-[-0.015em] text-ink-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
        {description}
      </p>
    </div>
  );
}
