import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Clock, ShieldAlert, Timer } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Button } from "@/components/ui/button";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { daysBetween, formatCurrency } from "@/lib/format";
import { OverdueClient, bucketOf, type BucketKey } from "./overdue-client";
import type { InvoiceFull } from "@/lib/types";

export const metadata: Metadata = { title: "Inadimplência" };
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  faixa?: string;
  bloqueio?: string;
  obrigatoria?: string;
}

const BUCKETS: { key: BucketKey; label: string; hint: string }[] = [
  { key: "1-7", label: "1 a 7 dias", hint: "Atraso recente — cobrança amigável" },
  { key: "8-15", label: "8 a 15 dias", hint: "Reforçar contato e reenviar link" },
  { key: "16-30", label: "16 a 30 dias", hint: "Risco alto — avaliar bloqueio" },
  { key: "30+", label: "Mais de 30 dias", hint: "Crítico — negociar ou suspender" },
];

async function loadOverdue(params: SearchParams) {
  return safeQuery(
    async () => {
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate()
      ).padStart(2, "0")}`;

      let query = db()
        .from("v_invoices_full")
        .select("*")
        .in("status", ["OVERDUE", "EXPIRED", "PARTIALLY_PAID", "OPEN", "PENDING"])
        .lt("due_date", todayIso)
        .order("due_date", { ascending: true })
        .limit(400);

      if (params.bloqueio === "bloqueados") query = query.eq("project_status", "BLOCKED_PAYMENT");
      if (params.bloqueio === "liberados") query = query.neq("project_status", "BLOCKED_PAYMENT");
      if (params.obrigatoria === "sim") query = query.eq("is_mandatory", true);
      if (params.obrigatoria === "nao") query = query.eq("is_mandatory", false);

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `code.ilike.${like},description.ilike.${like},customer_name.ilike.${like},project_name.ilike.${like}`
        );
      }

      const { data } = await query;
      return (data ?? []) as InvoiceFull[];
    },
    [] as InvoiceFull[]
  );
}

export default async function OverduePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const all = await loadOverdue(params);

  const withAging = all.map((invoice) => ({
    invoice,
    overdue: Math.max(Math.abs(daysBetween(invoice.due_date)), 1),
    balance: Number(invoice.total) - Number(invoice.paid_amount),
  }));

  const buckets = BUCKETS.map((bucket) => {
    const items = withAging.filter((row) => bucketOf(row.overdue) === bucket.key);
    return {
      ...bucket,
      count: items.length,
      amount: items.reduce((sum, row) => sum + row.balance, 0),
    };
  });

  const filtered = params.faixa
    ? withAging.filter((row) => bucketOf(row.overdue) === params.faixa)
    : withAging;

  const rows = filtered
    .sort((a, b) => b.overdue - a.overdue)
    .map((row) => row.invoice);

  const totalOverdue = withAging.reduce((sum, row) => sum + row.balance, 0);
  const blockedProjects = new Set(
    withAging
      .filter((row) => row.invoice.project_status === "BLOCKED_PAYMENT")
      .map((row) => row.invoice.project_id)
  ).size;

  return (
    <>
      <PageHeader
        title="Inadimplência"
        description="Régua de cobrança por faixa de atraso, com ações em lote e controle de bloqueio de acesso."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/cobrancas?periodo=atrasadas">Ver em cobranças</Link>
          </Button>
        }
        meta={
          totalOverdue > 0 ? (
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 tabular">
              {formatCurrency(totalOverdue)} em atraso
            </span>
          ) : undefined
        }
      />

      <div className="mb-6">
        <StatGrid>
          {buckets.map((bucket, index) => (
            <StatCard
              key={bucket.key}
              label={`Atraso de ${bucket.label}`}
              value={formatCurrency(bucket.amount)}
              hint={`${bucket.count} cobrança(s) · ${bucket.hint}`}
              icon={
                index === 0 ? (
                  <Clock />
                ) : index === 1 ? (
                  <Timer />
                ) : index === 2 ? (
                  <AlertTriangle />
                ) : (
                  <ShieldAlert />
                )
              }
              tone={
                bucket.count === 0
                  ? "neutral"
                  : index <= 1
                    ? "warning"
                    : "danger"
              }
              href={`/inadimplencia?faixa=${encodeURIComponent(bucket.key)}`}
            />
          ))}
        </StatGrid>
      </div>

      {blockedProjects > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <ShieldAlert className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-rose-900">
            {blockedProjects} projeto(s) com acesso bloqueado por inadimplência. O acesso é
            restabelecido automaticamente assim que o pagamento é confirmado.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/bloqueios">Ver controle de acesso</Link>
          </Button>
        </div>
      )}

      <OverdueClient
        rows={rows}
        canWrite={can(user.role, "billing:write")}
        canBlock={can(user.role, "projects:block")}
        activeBucket={params.faixa ?? null}
      />
    </>
  );
}
