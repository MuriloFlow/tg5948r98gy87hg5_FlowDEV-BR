import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Building2, CheckCircle2, FileText, Users } from "lucide-react";
import { can, requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import {
  CompaniesClient,
  type CompanyRow,
  type CustomerOption,
} from "./companies-client";

export const metadata: Metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  cliente?: string;
  status?: string;
}

async function loadCustomers(): Promise<CustomerOption[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("customers")
      .select("id, name, legal_name, code")
      .neq("status", "ARCHIVED")
      .order("name", { ascending: true })
      .limit(500);
    return (data ?? []) as CustomerOption[];
  }, []);
}

async function loadCompanies(params: SearchParams): Promise<CompanyRow[]> {
  return safeQuery(async () => {
    let query = db()
      .from("companies")
      .select("*")
      .order("legal_name", { ascending: true })
      .limit(300);

    if (params.cliente) query = query.eq("customer_id", params.cliente);
    if (params.status) query = query.eq("status", params.status);
    else query = query.neq("status", "ARCHIVED");

    if (params.q) {
      const like = `%${params.q}%`;
      query = query.or(`legal_name.ilike.${like},trade_name.ilike.${like},cnpj.ilike.${like}`);
    }

    const { data } = await query;
    const companies = (data ?? []) as CompanyRow[];

    const ids = [...new Set(companies.map((company) => company.customer_id))];
    if (ids.length > 0) {
      const { data: customers } = await db()
        .from("customers")
        .select("id, name, legal_name, code")
        .in("id", ids);

      const names = new Map<string, string>(
        ((customers ?? []) as CustomerOption[]).map((customer) => [
          customer.id,
          customer.legal_name || customer.name,
        ])
      );
      for (const company of companies) {
        company.customer_name = names.get(company.customer_id) ?? null;
      }
    }

    return companies;
  }, []);
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("customers:read");
  const params = await searchParams;

  const [companies, customers] = await Promise.all([
    loadCompanies(params),
    loadCustomers(),
  ]);

  const withCnpj = companies.filter((company) => company.cnpj).length;
  const active = companies.filter((company) => company.status === "ACTIVE").length;
  const linkedCustomers = new Set(companies.map((company) => company.customer_id)).size;

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Pessoas jurídicas vinculadas aos clientes — usadas como emissoras nas notas e nos contratos."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Empresas cadastradas"
            value={formatNumber(companies.length)}
            icon={<Building2 />}
            tone="info"
          />
          <StatCard label="Ativas" value={formatNumber(active)} icon={<CheckCircle2 />} tone="success" />
          <StatCard
            label="Com CNPJ informado"
            value={formatNumber(withCnpj)}
            hint="Necessário para emissão de nota"
            icon={<FileText />}
            tone={withCnpj < companies.length ? "warning" : "neutral"}
          />
          <StatCard
            label="Clientes atendidos"
            value={formatNumber(linkedCustomers)}
            icon={<Users />}
            tone="violet"
          />
        </StatGrid>
      </div>

      <CompaniesClient
        companies={companies}
        customers={customers}
        canWrite={can(user.role, "customers:write")}
      />
    </>
  );
}
