"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ReportType =
  | "recebimentos"
  | "inadimplencia"
  | "cliente"
  | "projeto"
  | "metodo";

export type ReportFormat = "text" | "date" | "currency" | "number" | "decimal";

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportFormat;
  align?: "left" | "right";
}

export type ReportRow = Record<string, string | number | null>;

const TYPE_OPTIONS: { value: ReportType; label: string; description: string }[] = [
  {
    value: "recebimentos",
    label: "Recebimentos",
    description: "Cobranças quitadas no período, com data de pagamento.",
  },
  {
    value: "inadimplencia",
    label: "Inadimplência",
    description: "Cobranças vencidas e parciais, com dias de atraso e saldo devedor.",
  },
  {
    value: "cliente",
    label: "Por cliente",
    description: "Recebido, em aberto e atrasado consolidados por cliente.",
  },
  {
    value: "projeto",
    label: "Por projeto",
    description: "Recebido, em aberto e atrasado consolidados por projeto.",
  },
  {
    value: "metodo",
    label: "Por método de pagamento",
    description: "Volume, taxas e líquido por meio de pagamento aprovado.",
  },
];

const PERIOD_OPTIONS = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "tudo", label: "Todo o período" },
];

function formatCell(value: string | number | null, format: ReportFormat): string {
  if (value == null || value === "") return "—";
  switch (format) {
    case "currency":
      return formatCurrency(Number(value));
    case "number":
      return formatNumber(Number(value));
    case "decimal":
      return Number(value).toFixed(1).replace(".", ",");
    case "date":
      return formatDate(String(value));
    default:
      return String(value);
  }
}

function csvValue(value: string | number | null, format: ReportFormat): string {
  if (value == null) return "";
  if (format === "currency" || format === "decimal") {
    return Number(value).toFixed(2).replace(".", ",");
  }
  if (format === "number") return String(Number(value));
  if (format === "date") return formatDate(String(value));
  return String(value).replace(/"/g, '""');
}

export function ReportsClient({
  tipo,
  periodo,
  columns,
  rows,
}: {
  tipo: ReportType;
  periodo: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const meta = TYPE_OPTIONS.find((option) => option.value === tipo) ?? TYPE_OPTIONS[0];
  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === periodo)?.label ?? "Período selecionado";

  const totals = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const column of columns) {
      if (column.format === "currency" || column.format === "number") {
        result[column.key] = rows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0);
      }
    }
    return result;
  }, [columns, rows]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    startTransition(() => router.push(`/relatorios?${next.toString()}`));
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.error("Nada para exportar neste relatório");
      return;
    }

    const header = columns.map((column) => `"${column.label}"`).join(";");
    const body = rows
      .map((row) =>
        columns.map((column) => `"${csvValue(row[column.key], column.format)}"`).join(";")
      )
      .join("\r\n");

    const csv = `\uFEFF${header}\r\n${body}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `flowdesk-${tipo}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`${rows.length} linha(s) exportada(s)`);
  }

  return (
    <div className="space-y-5">
      <Card className="no-print">
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <label htmlFor="report-type" className="block text-[13px] font-medium text-ink-700">
              Tipo de relatório
            </label>
            <NativeSelect
              id="report-type"
              value={tipo}
              onChange={(event) => update("tipo", event.target.value)}
              disabled={pending}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="min-w-[190px] space-y-1.5">
            <label htmlFor="report-period" className="block text-[13px] font-medium text-ink-700">
              Período
            </label>
            <NativeSelect
              id="report-period"
              value={periodo}
              onChange={(event) => update("periodo", event.target.value)}
              disabled={pending}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Download />}
              onClick={exportCsv}
              disabled={pending || rows.length === 0}
            >
              Exportar CSV
            </Button>
            <Button
              variant="secondary"
              icon={<Printer />}
              onClick={() => window.print()}
              disabled={pending}
            >
              Imprimir
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold text-ink-900">
          {meta.label} · {periodLabel}
        </h2>
        <p className="text-[13px] text-ink-500">{meta.description}</p>
      </div>

      <TableWrap className={cn(pending && "opacity-60 transition-opacity")}>
        <Table>
          <THead>
            <tr>
              {columns.map((column) => (
                <TH key={column.key} align={column.align ?? "left"}>
                  {column.label}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={Math.max(1, columns.length)}
                icon={<FileSpreadsheet />}
                title="Nenhum resultado no período"
                description="Ajuste o tipo de relatório ou amplie o período para ver os dados."
              />
            ) : (
              rows.map((row, index) => (
                <TR key={index}>
                  {columns.map((column) => (
                    <TD
                      key={column.key}
                      align={column.align ?? "left"}
                      className={cn(
                        column.format !== "text" && "tabular",
                        column.key === "atrasado" || column.key === "saldo"
                          ? "text-rose-600"
                          : undefined
                      )}
                    >
                      {formatCell(row[column.key], column.format)}
                    </TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>

          {rows.length > 0 && (
            <tfoot className="border-t border-ink-200 bg-ink-50/60">
              <tr>
                {columns.map((column, index) => (
                  <TD
                    key={column.key}
                    align={column.align ?? "left"}
                    className={cn(
                      "py-2.5 font-semibold text-ink-900",
                      column.format !== "text" && "tabular"
                    )}
                  >
                    {index === 0
                      ? `Total · ${rows.length} linha(s)`
                      : column.key in totals
                        ? formatCell(totals[column.key], column.format)
                        : ""}
                  </TD>
                ))}
              </tr>
            </tfoot>
          )}
        </Table>
      </TableWrap>
    </div>
  );
}
