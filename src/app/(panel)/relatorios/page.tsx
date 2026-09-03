import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { PAYMENT_METHOD } from "@/lib/labels";
import type { PaymentMethod } from "@/lib/types";
import {
  ReportsClient,
  type ReportColumn,
  type ReportRow,
  type ReportType,
} from "./reports-client";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const PERIODS: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
  tudo: null,
};

const TYPES: ReportType[] = ["recebimentos", "inadimplencia", "cliente", "projeto", "metodo"];

interface SearchParams {
  tipo?: string;
  periodo?: string;
}

interface InvoiceRow {
  code: string;
  customer_name: string;
  project_name: string;
  status: string;
  total: number | string;
  paid_amount: number | string;
  balance_due: number | string;
  days_overdue: number | null;
  due_date: string;
  paid_at: string | null;
}

interface PaymentRow {
  method: PaymentMethod;
  amount: number | string;
  fee_amount: number | string;
  net_amount: number | string | null;
  installments: number;
}

function periodStart(periodo: string): string | null {
  const days = PERIODS[periodo] ?? null;
  if (days == null) return null;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function loadReport(tipo: ReportType, periodo: string) {
  const since = periodStart(periodo);

  return safeQuery<{ columns: ReportColumn[]; rows: ReportRow[] }>(
    async () => {
      if (tipo === "metodo") {
        let query = db()
          .from("payments")
          .select("method, amount, fee_amount, net_amount, installments")
          .eq("status", "APPROVED")
          .limit(5000);
        if (since) query = query.gte("approved_at", since);

        const { data } = await query;
        const payments = (data ?? []) as PaymentRow[];

        const grouped = new Map<
          string,
          { count: number; amount: number; fee: number; net: number; installments: number }
        >();

        for (const payment of payments) {
          const key = payment.method;
          const current =
            grouped.get(key) ?? { count: 0, amount: 0, fee: 0, net: 0, installments: 0 };
          const amount = Number(payment.amount ?? 0);
          const fee = Number(payment.fee_amount ?? 0);
          grouped.set(key, {
            count: current.count + 1,
            amount: current.amount + amount,
            fee: current.fee + fee,
            net: current.net + Number(payment.net_amount ?? amount - fee),
            installments: current.installments + Number(payment.installments ?? 1),
          });
        }

        const rows: ReportRow[] = [...grouped.entries()]
          .map(([method, value]) => ({
            metodo: PAYMENT_METHOD[method as PaymentMethod]?.label ?? method,
            quantidade: value.count,
            parcelas_media: value.count > 0 ? value.installments / value.count : 0,
            bruto: value.amount,
            taxas: value.fee,
            liquido: value.net,
          }))
          .sort((a, b) => Number(b.bruto) - Number(a.bruto));

        return {
          columns: [
            { key: "metodo", label: "Método", format: "text" },
            { key: "quantidade", label: "Pagamentos", format: "number", align: "right" },
            { key: "parcelas_media", label: "Parcelas (média)", format: "decimal", align: "right" },
            { key: "bruto", label: "Bruto", format: "currency", align: "right" },
            { key: "taxas", label: "Taxas", format: "currency", align: "right" },
            { key: "liquido", label: "Líquido", format: "currency", align: "right" },
          ],
          rows,
        };
      }

      /* Os demais relatórios partem da mesma base de cobranças. */
      let query = db()
        .from("v_invoices_full")
        .select(
          "code, customer_name, project_name, status, total, paid_amount, balance_due, days_overdue, due_date, paid_at"
        )
        .neq("status", "CANCELED")
        .limit(5000);

      if (tipo === "recebimentos") {
        query = query.eq("status", "PAID").order("paid_at", { ascending: false });
        if (since) query = query.gte("paid_at", since);
      } else if (tipo === "inadimplencia") {
        query = query.in("status", ["OVERDUE", "PARTIALLY_PAID"]).order("due_date", {
          ascending: true,
        });
      } else {
        query = query.order("due_date", { ascending: false });
        if (since) query = query.gte("due_date", since.slice(0, 10));
      }

      const { data } = await query;
      const invoices = (data ?? []) as InvoiceRow[];

      if (tipo === "recebimentos") {
        return {
          columns: [
            { key: "pago_em", label: "Pago em", format: "date" },
            { key: "cobranca", label: "Cobrança", format: "text" },
            { key: "cliente", label: "Cliente", format: "text" },
            { key: "projeto", label: "Projeto", format: "text" },
            { key: "vencimento", label: "Vencimento", format: "date" },
            { key: "valor", label: "Valor", format: "currency", align: "right" },
          ],
          rows: invoices.map((invoice) => ({
            pago_em: invoice.paid_at,
            cobranca: invoice.code,
            cliente: invoice.customer_name,
            projeto: invoice.project_name,
            vencimento: invoice.due_date,
            valor: Number(invoice.total ?? 0),
          })),
        };
      }

      if (tipo === "inadimplencia") {
        return {
          columns: [
            { key: "cobranca", label: "Cobrança", format: "text" },
            { key: "cliente", label: "Cliente", format: "text" },
            { key: "projeto", label: "Projeto", format: "text" },
            { key: "vencimento", label: "Vencimento", format: "date" },
            { key: "atraso", label: "Dias em atraso", format: "number", align: "right" },
            { key: "saldo", label: "Saldo devedor", format: "currency", align: "right" },
          ],
          rows: invoices.map((invoice) => ({
            cobranca: invoice.code,
            cliente: invoice.customer_name,
            projeto: invoice.project_name,
            vencimento: invoice.due_date,
            atraso: Math.max(0, Number(invoice.days_overdue ?? 0)),
            saldo: Number(invoice.balance_due ?? 0),
          })),
        };
      }

      /* Agregação por cliente ou por projeto. */
      const byKey = new Map<
        string,
        { count: number; received: number; open: number; overdue: number }
      >();

      for (const invoice of invoices) {
        const key =
          tipo === "cliente"
            ? (invoice.customer_name ?? "—")
            : (invoice.project_name ?? "—");
        const current = byKey.get(key) ?? { count: 0, received: 0, open: 0, overdue: 0 };
        const balance = Number(invoice.balance_due ?? 0);

        byKey.set(key, {
          count: current.count + 1,
          received: current.received + Number(invoice.paid_amount ?? 0),
          open:
            current.open +
            (["OPEN", "PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)
              ? balance
              : 0),
          overdue: current.overdue + (invoice.status === "OVERDUE" ? balance : 0),
        });
      }

      const rows: ReportRow[] = [...byKey.entries()]
        .map(([label, value]) => ({
          nome: label,
          cobrancas: value.count,
          recebido: value.received,
          em_aberto: value.open,
          atrasado: value.overdue,
        }))
        .sort((a, b) => Number(b.recebido) - Number(a.recebido));

      return {
        columns: [
          { key: "nome", label: tipo === "cliente" ? "Cliente" : "Projeto", format: "text" },
          { key: "cobrancas", label: "Cobranças", format: "number", align: "right" },
          { key: "recebido", label: "Recebido", format: "currency", align: "right" },
          { key: "em_aberto", label: "Em aberto", format: "currency", align: "right" },
          { key: "atrasado", label: "Atrasado", format: "currency", align: "right" },
        ],
        rows,
      };
    },
    { columns: [] as ReportColumn[], rows: [] as ReportRow[] }
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("billing:read");
  const params = await searchParams;

  const tipo = TYPES.includes(params.tipo as ReportType)
    ? (params.tipo as ReportType)
    : "recebimentos";
  const periodo = params.periodo && params.periodo in PERIODS ? params.periodo : "30d";

  const { columns, rows } = await loadReport(tipo, periodo);

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Monte o relatório, confira os totais na tela e exporte em CSV ou imprima."
        className="no-print"
      />

      <ReportsClient tipo={tipo} periodo={periodo} columns={columns} rows={rows} />
    </>
  );
}
