"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange, LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RevenueChart } from "@/components/panel/revenue-chart";
import { formatCurrency } from "@/lib/format";
import type { MonthlyRevenue } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CashMonth {
  key: string;
  label: string;
  received: number;
  expected: number;
  outflow: number;
  net: number;
  balance: number;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface CashWeek {
  label: string;
  inflow: number;
  outflow: number;
  balance: number;
}

function Signed({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold tabular",
        value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-ink-400",
        className
      )}
    >
      {value > 0 ? "+" : ""}
      {formatCurrency(value)}
    </span>
  );
}

export function CashflowClient({
  months,
  weeks,
  monthly,
}: {
  months: CashMonth[];
  weeks: CashWeek[];
  monthly: MonthlyRevenue[];
}) {
  const maxFlow = React.useMemo(
    () => Math.max(1, ...months.map((month) => Math.max(month.received + month.expected, month.outflow))),
    [months]
  );

  const totals = React.useMemo(
    () =>
      months.reduce(
        (acc, month) => ({
          inflow: acc.inflow + month.received + month.expected,
          outflow: acc.outflow + month.outflow,
        }),
        { inflow: 0, outflow: 0 }
      ),
    [months]
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Entradas e saídas por mês</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              Barras proporcionais ao maior movimento do período
            </p>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-brand-500" aria-hidden />
              entradas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-400" aria-hidden />
              saídas
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {months.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-[13px] text-ink-400">
              Sem movimentos registrados para projetar o fluxo.
            </div>
          ) : (
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {months.map((month) => {
                const inflow = month.received + month.expected;
                return (
                  <div
                    key={month.key}
                    className="flex min-w-[52px] flex-1 flex-col items-center gap-2"
                    title={`${month.label} · entradas ${formatCurrency(inflow)} · saídas ${formatCurrency(month.outflow)}`}
                  >
                    <div className="flex h-[160px] w-full items-end justify-center gap-1">
                      <div
                        className={cn(
                          "w-1/2 rounded-t-md bg-brand-500/85 transition-[height] duration-700 ease-out",
                          month.isFuture && "bg-brand-500/45"
                        )}
                        style={{ height: `${Math.max(2, (inflow / maxFlow) * 100)}%` }}
                      />
                      <div
                        className={cn(
                          "w-1/2 rounded-t-md bg-rose-400/85 transition-[height] duration-700 ease-out",
                          month.isFuture && "bg-rose-400/45"
                        )}
                        style={{ height: `${Math.max(2, (month.outflow / maxFlow) * 100)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[11px] text-ink-400",
                        month.isCurrent && "font-semibold text-ink-800"
                      )}
                    >
                      {month.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TableWrap>
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <LineChart className="size-4 text-ink-400" aria-hidden />
            <h2 className="text-[13px] font-semibold text-ink-900">Projeção mês a mês</h2>
          </div>
          <p className="text-[12px] text-ink-500">
            Meses futuros usam cobranças em aberto e despesas previstas
          </p>
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Mês</TH>
              <TH align="right">Recebido</TH>
              <TH align="right">A receber</TH>
              <TH align="right">Saídas</TH>
              <TH align="right">Resultado</TH>
              <TH align="right">Saldo acumulado</TH>
            </tr>
          </THead>
          <TBody>
            {months.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<CalendarRange />}
                title="Nada a projetar ainda"
                description="Cadastre cobranças e despesas para ver a projeção de caixa dos próximos meses."
              />
            ) : (
              months.map((month) => (
                <TR key={month.key} className={cn(month.isCurrent && "bg-brand-50/40")}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900">{month.label}</span>
                      {month.isCurrent && (
                        <Badge tone="info" size="sm">
                          mês atual
                        </Badge>
                      )}
                      {month.isFuture && (
                        <Badge tone="neutral" size="sm">
                          previsto
                        </Badge>
                      )}
                    </div>
                  </TD>
                  <TD align="right" className="tabular">
                    {month.received > 0 ? formatCurrency(month.received) : "—"}
                  </TD>
                  <TD align="right" className="tabular">
                    {month.expected > 0 ? formatCurrency(month.expected) : "—"}
                  </TD>
                  <TD align="right" className="tabular text-rose-600">
                    {month.outflow > 0 ? `− ${formatCurrency(month.outflow)}` : "—"}
                  </TD>
                  <TD align="right">
                    <Signed value={month.net} />
                  </TD>
                  <TD align="right">
                    <span
                      className={cn(
                        "font-semibold tabular",
                        month.balance < 0 ? "text-rose-600" : "text-ink-900"
                      )}
                    >
                      {formatCurrency(month.balance)}
                    </span>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        {months.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-6 border-t border-ink-200 bg-ink-50/40 px-4 py-2.5 text-[12.5px]">
            <span className="flex items-center gap-1.5 text-ink-500">
              <ArrowUpRight className="size-3.5 text-emerald-500" aria-hidden />
              entradas
              <span className="font-semibold tabular text-ink-900">
                {formatCurrency(totals.inflow)}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-ink-500">
              <ArrowDownRight className="size-3.5 text-rose-500" aria-hidden />
              saídas
              <span className="font-semibold tabular text-ink-900">
                {formatCurrency(totals.outflow)}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-ink-500">
              resultado
              <Signed value={totals.inflow - totals.outflow} />
            </span>
          </div>
        )}
      </TableWrap>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Próximos 90 dias, por semana</CardTitle>
              <p className="text-[12.5px] text-ink-500">
                Cobranças em aberto e despesas com vencimento na semana
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <tr>
                  <TH>Semana</TH>
                  <TH align="right">Entradas</TH>
                  <TH align="right">Saídas</TH>
                  <TH align="right">Acumulado</TH>
                </tr>
              </THead>
              <TBody>
                {weeks.length === 0 ? (
                  <TableEmpty
                    colSpan={4}
                    icon={<CalendarRange />}
                    title="Nenhum vencimento nos próximos 90 dias"
                  />
                ) : (
                  weeks.map((week) => {
                    const idle = week.inflow === 0 && week.outflow === 0;
                    return (
                      <TR key={week.label} className={cn(idle && "opacity-60")}>
                        <TD className="font-medium tabular text-ink-800">{week.label}</TD>
                        <TD align="right" className="tabular text-emerald-600">
                          {week.inflow > 0 ? formatCurrency(week.inflow) : "—"}
                        </TD>
                        <TD align="right" className="tabular text-rose-600">
                          {week.outflow > 0 ? formatCurrency(week.outflow) : "—"}
                        </TD>
                        <TD align="right">
                          <span
                            className={cn(
                              "font-semibold tabular",
                              week.balance < 0 ? "text-rose-600" : "text-ink-900"
                            )}
                          >
                            {formatCurrency(week.balance)}
                          </span>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="space-y-0.5">
              <CardTitle>Receita dos últimos 12 meses</CardTitle>
              <p className="text-[12.5px] text-ink-500">Recebido x previsto por competência</p>
            </div>
          </CardHeader>
          <CardContent>
            <RevenueChart data={monthly} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
