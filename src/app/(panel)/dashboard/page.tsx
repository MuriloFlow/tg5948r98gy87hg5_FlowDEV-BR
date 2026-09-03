import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Blocks,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Plus,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { RevenueChart } from "@/components/panel/revenue-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/guard";
import {
  getFinancialSummary,
  getMonthlyRevenue,
  getOverdueInvoices,
  getProjectHealth,
  getRecentActivity,
  getRecentInvoices,
  getUpcomingInvoices,
} from "@/lib/queries";
import { formatCurrency, formatDate, formatRelative, daysBetween } from "@/lib/format";
import { invoiceStatusMeta, projectStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [summary, revenue, recent, overdue, upcoming, health, activity] = await Promise.all([
    getFinancialSummary(),
    getMonthlyRevenue(),
    getRecentInvoices(6),
    getOverdueInvoices(5),
    getUpcomingInvoices(6),
    getProjectHealth(6),
    getRecentActivity(8),
  ]);

  const blocked = health.filter((p) => p.status === "BLOCKED_PAYMENT");
  const previous = revenue.at(-2)?.received ?? 0;
  const current = revenue.at(-1)?.received ?? 0;
  const trend = previous > 0 ? ((current - previous) / previous) * 100 : null;

  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description="Panorama financeiro e operacional de todos os seus projetos integrados."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/links">
                <Receipt />
                Novo payment link
              </Link>
            </Button>
            <Button asChild>
              <Link href="/cobrancas?novo=1">
                <Plus />
                Nova cobrança
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <StatGrid>
          <StatCard
            label="A receber"
            value={formatCurrency(summary.total_to_receive)}
            hint={`${summary.open_count} cobrança${summary.open_count === 1 ? "" : "s"} em aberto`}
            icon={<Wallet />}
            tone="info"
            href="/cobrancas?status=OPEN"
          />
          <StatCard
            label="Recebido no mês"
            value={formatCurrency(summary.received_this_month)}
            hint={`Total histórico: ${formatCurrency(summary.total_received)}`}
            icon={<TrendingUp />}
            tone="success"
            trend={trend != null ? { value: trend } : null}
            href="/pagamentos"
          />
          <StatCard
            label="Em atraso"
            value={formatCurrency(summary.total_overdue)}
            hint={`${summary.overdue_count} cobrança${summary.overdue_count === 1 ? "" : "s"} vencida${summary.overdue_count === 1 ? "" : "s"}`}
            icon={<AlertTriangle />}
            tone={summary.total_overdue > 0 ? "danger" : "neutral"}
            href="/inadimplencia"
          />
          <StatCard
            label="Projetos bloqueados"
            value={String(blocked.length)}
            hint={
              blocked.length > 0
                ? "Aplicações com acesso suspenso"
                : "Todos os projetos liberados"
            }
            icon={<ShieldAlert />}
            tone={blocked.length > 0 ? "danger" : "success"}
            href="/bloqueios"
          />
        </StatGrid>

        {blocked.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3.5 animate-slide-up">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
              <ShieldAlert className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-rose-900">
                {blocked.length} projeto{blocked.length > 1 ? "s" : ""} bloqueado
                {blocked.length > 1 ? "s" : ""} por falta de pagamento
              </p>
              <p className="truncate text-[12.5px] text-rose-700/85">
                {blocked.map((p) => p.name).join(" · ")}
              </p>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/bloqueios">
                Revisar
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
          <Card>
            <CardHeader>
              <div className="space-y-0.5">
                <CardTitle>Receita dos últimos 12 meses</CardTitle>
                <p className="text-[12.5px] text-ink-500">
                  Recebido efetivo comparado ao previsto por vencimento
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11.5px] text-ink-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand-500" /> Recebido
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-mint-500" /> Previsto
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <RevenueChart data={revenue} />
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Próximos vencimentos</CardTitle>
              <Link
                href="/cobrancas"
                className="text-[12.5px] font-medium text-brand-600 hover:underline"
              >
                Ver todas
              </Link>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {upcoming.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    icon={<CalendarClock />}
                    title="Nada vencendo"
                    description="Você não tem cobranças em aberto com vencimento futuro."
                    className="border-0 bg-transparent py-0"
                  />
                </div>
              ) : (
                <ul className="divide-y divide-ink-200/70">
                  {upcoming.map((invoice) => {
                    const days = daysBetween(invoice.due_date);
                    return (
                      <li key={invoice.id}>
                        <Link
                          href={`/cobrancas/${invoice.id}`}
                          className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50/70"
                        >
                          <Avatar name={invoice.customer_name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-ink-900">
                              {invoice.customer_name}
                            </p>
                            <p className="truncate text-[11.5px] text-ink-500">
                              {invoice.project_name} · vence {formatDate(invoice.due_date)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[13px] font-semibold tabular text-ink-900">
                              {formatCurrency(invoice.total)}
                            </p>
                            <p
                              className={
                                days <= 3
                                  ? "text-[11px] font-medium text-amber-600"
                                  : "text-[11px] text-ink-400"
                              }
                            >
                              {days === 0
                                ? "vence hoje"
                                : days === 1
                                  ? "amanhã"
                                  : `em ${days} dias`}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {overdue.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Cobranças em atraso</CardTitle>
                <Badge tone="danger" size="sm">
                  {summary.overdue_count}
                </Badge>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/inadimplencia">Gerenciar inadimplência</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <tr>
                    <TH>Cliente</TH>
                    <TH>Projeto</TH>
                    <TH>Cobrança</TH>
                    <TH>Vencimento</TH>
                    <TH align="right">Valor</TH>
                    <TH align="right">Atraso</TH>
                  </tr>
                </THead>
                <TBody>
                  {overdue.map((invoice) => (
                    <TR key={invoice.id} clickable>
                      <TD>
                        <Link
                          href={`/cobrancas/${invoice.id}`}
                          className="flex items-center gap-2.5 font-medium text-ink-900"
                        >
                          <Avatar name={invoice.customer_name} size="xs" />
                          {invoice.customer_name}
                        </Link>
                      </TD>
                      <TD>{invoice.project_name}</TD>
                      <TD>
                        <span className="font-mono text-[12px] text-ink-500">{invoice.code}</span>
                      </TD>
                      <TD>{formatDate(invoice.due_date)}</TD>
                      <TD align="right" className="font-semibold tabular">
                        {formatCurrency(invoice.balance_due)}
                      </TD>
                      <TD align="right">
                        <Badge tone="danger" size="sm">
                          {Math.abs(daysBetween(invoice.due_date))} dias
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Cobranças recentes</CardTitle>
              <Link
                href="/cobrancas"
                className="text-[12.5px] font-medium text-brand-600 hover:underline"
              >
                Ver todas
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <TableWrap className="rounded-none border-0 shadow-none">
                <Table>
                  <THead>
                    <tr>
                      <TH>Cobrança</TH>
                      <TH>Cliente</TH>
                      <TH>Status</TH>
                      <TH align="right">Valor</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {recent.length === 0 ? (
                      <TableEmpty
                        colSpan={4}
                        icon={<Receipt />}
                        title="Nenhuma cobrança ainda"
                        description="Cadastre um cliente e um projeto para emitir a primeira cobrança."
                        action={
                          <Button size="sm" asChild>
                            <Link href="/clientes">Cadastrar cliente</Link>
                          </Button>
                        }
                      />
                    ) : (
                      recent.map((invoice) => (
                        <TR key={invoice.id} clickable>
                          <TD>
                            <Link href={`/cobrancas/${invoice.id}`} className="block">
                              <span className="block font-medium text-ink-900">
                                {invoice.description}
                              </span>
                              <span className="font-mono text-[11.5px] text-ink-400">
                                {invoice.code}
                              </span>
                            </Link>
                          </TD>
                          <TD>{invoice.customer_name}</TD>
                          <TD>
                            <StatusBadge meta={invoiceStatusMeta(invoice.status)} size="sm" />
                          </TD>
                          <TD align="right" className="font-semibold tabular">
                            {formatCurrency(invoice.total)}
                          </TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Saúde dos projetos</CardTitle>
                <Link
                  href="/projetos"
                  className="text-[12.5px] font-medium text-brand-600 hover:underline"
                >
                  Ver todos
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {health.length === 0 ? (
                  <div className="px-5 py-8">
                    <EmptyState
                      icon={<Blocks />}
                      title="Nenhum projeto"
                      description="Crie o primeiro projeto para gerar credenciais de API."
                      className="border-0 bg-transparent py-0"
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-ink-200/70">
                    {health.map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/projetos/${project.id}`}
                          className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50/70"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-ink-900">
                              {project.name}
                            </p>
                            <p className="truncate text-[11.5px] text-ink-500">
                              {project.primary_domain ?? project.customer_name} ·{" "}
                              {project.requests_24h} req/24h
                            </p>
                          </div>
                          <StatusBadge
                            meta={projectStatusMeta(project.status)}
                            size="sm"
                            dot={false}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Atividade recente</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {activity.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-ink-400">
                    Nada registrado ainda.
                  </p>
                ) : (
                  <ol className="relative space-y-0 px-5 py-4">
                    {activity.map((entry, index) => (
                      <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < activity.length - 1 && (
                          <span
                            className="absolute left-[11px] top-6 h-full w-px bg-ink-200"
                            aria-hidden
                          />
                        )}
                        <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                          {entry.kind === "payment" ? (
                            <CreditCard className="size-3" />
                          ) : entry.kind === "status_changed" ? (
                            <CheckCircle2 className="size-3" />
                          ) : (
                            <Receipt className="size-3" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium leading-snug text-ink-800">
                            {entry.title}
                          </p>
                          <p className="text-[11px] text-ink-400">
                            {formatRelative(entry.created_at)}
                            {entry.actor_label ? ` · ${entry.actor_label}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
