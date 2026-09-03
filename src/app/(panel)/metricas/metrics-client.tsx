"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard, Repeat, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Progress } from "@/components/ui/misc";
import { DonutChart, RevenueChart } from "@/components/panel/revenue-chart";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { BillingInterval, MonthlyRevenue } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MethodSlice {
  name: string;
  value: number;
  count: number;
}

export interface IntervalSlice {
  interval: BillingInterval;
  label: string;
  subscriptions: number;
  mrr: number;
}

export interface CustomerRevenue {
  id: string;
  name: string;
  total_paid: number;
  total_open: number;
  total_overdue: number;
  projects_count: number;
}

export function MetricsClient({
  monthly,
  methods,
  customers,
  intervals,
  mrr,
}: {
  monthly: MonthlyRevenue[];
  methods: MethodSlice[];
  customers: CustomerRevenue[];
  intervals: IntervalSlice[];
  mrr: number;
}) {
  const methodTotal = methods.reduce((sum, method) => sum + method.value, 0);
  const topPaid = customers.length > 0 ? Math.max(...customers.map((c) => c.total_paid)) : 0;

  const donut = React.useMemo(
    () => methods.map((method) => ({ name: method.name, value: method.value })),
    [methods]
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Evolução mensal</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              Recebido x previsto nos últimos 12 meses
            </p>
          </div>
          <TrendingUp className="size-4 text-ink-400" aria-hidden />
        </CardHeader>
        <CardContent>
          <RevenueChart data={monthly} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Distribuição por método</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                {methodTotal > 0
                  ? `${formatCurrency(methodTotal)} aprovados no total`
                  : "Nenhum pagamento aprovado ainda"}
              </p>
            </div>
            <CreditCard className="size-4 text-ink-400" aria-hidden />
          </CardHeader>
          <CardContent className="space-y-4">
            <DonutChart data={donut} height={220} />

            {methods.length > 0 && (
              <ul className="space-y-2 border-t border-ink-200/70 pt-3">
                {methods.map((method) => (
                  <li
                    key={method.name}
                    className="flex items-center justify-between gap-3 text-[12.5px]"
                  >
                    <span className="text-ink-600">{method.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-400">
                        {formatNumber(method.count)} pgto(s)
                      </span>
                      <span className="font-semibold tabular text-ink-900">
                        {formatCurrency(method.value)}
                      </span>
                      <Badge tone="neutral" size="sm">
                        {formatPercent(
                          methodTotal > 0 ? (method.value / methodTotal) * 100 : 0,
                          0
                        )}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Receita recorrente por periodicidade</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                Assinaturas ativas normalizadas para o mês
              </p>
            </div>
            <Repeat className="size-4 text-ink-400" aria-hidden />
          </CardHeader>
          <CardContent>
            {intervals.length === 0 ? (
              <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400 [&_svg]:size-5">
                  <Repeat />
                </span>
                <p className="text-sm font-medium text-ink-800">Nenhuma assinatura ativa</p>
                <p className="max-w-xs text-[13px] text-ink-500">
                  Crie assinaturas recorrentes para acompanhar o MRR do negócio.
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {intervals.map((interval) => {
                  const share = mrr > 0 ? (interval.mrr / mrr) * 100 : 0;
                  return (
                    <li key={interval.interval} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-medium text-ink-800">
                          {interval.label}
                        </span>
                        <span className="text-[13px] font-semibold tabular text-ink-900">
                          {formatCurrency(interval.mrr)}
                          <span className="ml-1.5 text-[11.5px] font-normal text-ink-400">
                            /mês
                          </span>
                        </span>
                      </div>
                      <Progress value={share} />
                      <p className="text-[11.5px] text-ink-400">
                        {formatNumber(interval.subscriptions)} assinatura(s) ·{" "}
                        {formatPercent(share, 0)} do MRR
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <TableWrap>
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-ink-400" aria-hidden />
            <h2 className="text-[13px] font-semibold text-ink-900">
              Top 10 clientes por receita
            </h2>
          </div>
          <p className="text-[12px] text-ink-500">Histórico completo de pagamentos</p>
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Cliente</TH>
              <TH>Participação</TH>
              <TH align="right">Recebido</TH>
              <TH align="right">Em aberto</TH>
              <TH align="right">Atrasado</TH>
              <TH align="right">Projetos</TH>
            </tr>
          </THead>
          <TBody>
            {customers.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<Users />}
                title="Sem receita registrada"
                description="Quando as primeiras cobranças forem pagas, o ranking de clientes aparece aqui."
              />
            ) : (
              customers.map((customer) => (
                <TR key={customer.id}>
                  <TD>
                    <Link
                      href={`/clientes/${customer.id}`}
                      className="font-medium text-ink-900 transition-colors hover:text-brand-600"
                      title="Abrir o cliente"
                    >
                      {customer.name}
                    </Link>
                  </TD>
                  <TD>
                    <div className="w-[140px]">
                      <Progress
                        value={topPaid > 0 ? (customer.total_paid / topPaid) * 100 : 0}
                      />
                    </div>
                  </TD>
                  <TD align="right" className="font-semibold tabular text-ink-900">
                    {formatCurrency(customer.total_paid)}
                  </TD>
                  <TD align="right" className="tabular">
                    {customer.total_open > 0 ? formatCurrency(customer.total_open) : "—"}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "tabular",
                      customer.total_overdue > 0 ? "font-medium text-rose-600" : "text-ink-400"
                    )}
                  >
                    {customer.total_overdue > 0 ? formatCurrency(customer.total_overdue) : "—"}
                  </TD>
                  <TD align="right" className="tabular">
                    {formatNumber(customer.projects_count)}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
