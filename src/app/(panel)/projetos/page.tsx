import type { Metadata } from "next";
import { Activity, Blocks, Repeat, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { requireUser, can } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Project, ProjectHealth } from "@/lib/types";
import { ProjectsTable, type ProjectRow } from "./projects-table";
import type { CompanyOption, CustomerOption } from "./project-form";

export const metadata: Metadata = { title: "Projetos" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  status?: string;
  cliente?: string;
  page?: string;
  novo?: string;
}

async function loadProjects(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("projects")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.status) query = query.eq("status", params.status);
      else query = query.neq("status", "ARCHIVED");

      if (params.cliente) query = query.eq("customer_id", params.cliente);

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `name.ilike.${like},code.ilike.${like},slug.ilike.${like},primary_domain.ilike.${like}`
        );
      }

      const { data, count } = await query;
      const projects = (data ?? []) as Project[];

      if (projects.length === 0) {
        return { rows: [] as ProjectRow[], total: count ?? 0, page };
      }

      const ids = projects.map((p) => p.id);
      const customerIds = [...new Set(projects.map((p) => p.customer_id))];

      const [{ data: health }, { data: customers }] = await Promise.all([
        db().from("v_project_health").select("*").in("id", ids),
        db().from("customers").select("id, name").in("id", customerIds),
      ]);

      const healthById = new Map(
        ((health ?? []) as ProjectHealth[]).map((h) => [h.id, h])
      );
      const nameById = new Map(
        ((customers ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
      );

      const rows: ProjectRow[] = projects.map((project) => {
        const stats = healthById.get(project.id);
        return {
          ...project,
          monthly_amount: Number(project.monthly_amount ?? 0),
          contract_value: Number(project.contract_value ?? 0),
          customer_name: nameById.get(project.customer_id) ?? "—",
          requests_24h: Number(stats?.requests_24h ?? 0),
          errors_24h: Number(stats?.errors_24h ?? 0),
          open_amount: Number(stats?.open_amount ?? 0),
          active_keys: Number(stats?.active_keys ?? 0),
        };
      });

      return { rows, total: count ?? 0, page };
    },
    { rows: [] as ProjectRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const [{ data: projects }, { data: health }] = await Promise.all([
        db().from("projects").select("status, monthly_amount").neq("status", "ARCHIVED"),
        db().from("v_project_health").select("requests_24h, errors_24h"),
      ]);

      const list = (projects ?? []) as { status: string; monthly_amount: number }[];

      return {
        active: list.filter((p) => p.status === "ACTIVE" || p.status === "TRIAL").length,
        blocked: list.filter(
          (p) => p.status === "BLOCKED_PAYMENT" || p.status === "SUSPENDED"
        ).length,
        mrr: list
          .filter((p) => p.status === "ACTIVE" || p.status === "TRIAL")
          .reduce((sum, p) => sum + Number(p.monthly_amount ?? 0), 0),
        requests24h: ((health ?? []) as { requests_24h: number }[]).reduce(
          (sum, h) => sum + Number(h.requests_24h ?? 0),
          0
        ),
        errors24h: ((health ?? []) as { errors_24h: number }[]).reduce(
          (sum, h) => sum + Number(h.errors_24h ?? 0),
          0
        ),
      };
    },
    { active: 0, blocked: 0, mrr: 0, requests24h: 0, errors24h: 0 }
  );
}

async function loadOptions() {
  return safeQuery(
    async () => {
      const [{ data: customers }, { data: companies }] = await Promise.all([
        db()
          .from("customers")
          .select("id, name, legal_name")
          .neq("status", "ARCHIVED")
          .order("name")
          .limit(500),
        db()
          .from("companies")
          .select("id, customer_id, legal_name, trade_name")
          .eq("status", "ACTIVE")
          .limit(500),
      ]);

      return {
        customers: ((customers ?? []) as { id: string; name: string; legal_name: string | null }[]).map(
          (c) => ({ id: c.id, name: c.legal_name || c.name }) satisfies CustomerOption
        ),
        companies: (
          (companies ?? []) as {
            id: string;
            customer_id: string;
            legal_name: string;
            trade_name: string | null;
          }[]
        ).map(
          (c) =>
            ({
              id: c.id,
              customer_id: c.customer_id,
              label: c.trade_name || c.legal_name,
            }) satisfies CompanyOption
        ),
      };
    },
    { customers: [] as CustomerOption[], companies: [] as CompanyOption[] }
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [{ rows, total, page }, summary, options] = await Promise.all([
    loadProjects(params),
    loadSummary(),
    loadOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Cada projeto é uma aplicação integrada: credenciais de API, webhooks, cobranças e controle de acesso próprios."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Projetos ativos"
            value={String(summary.active)}
            hint="Com acesso liberado"
            icon={<Blocks />}
            tone="info"
          />
          <StatCard
            label="Bloqueados"
            value={String(summary.blocked)}
            hint={
              summary.blocked > 0 ? "Aplicações sem acesso à API" : "Nenhuma aplicação suspensa"
            }
            icon={<ShieldAlert />}
            tone={summary.blocked > 0 ? "danger" : "success"}
            href="/bloqueios"
          />
          <StatCard
            label="Receita recorrente"
            value={formatCurrency(summary.mrr)}
            hint="Soma das mensalidades ativas"
            icon={<Repeat />}
            tone="success"
          />
          <StatCard
            label="Chamadas de API (24h)"
            value={formatNumber(summary.requests24h)}
            hint={
              summary.errors24h > 0
                ? `${formatNumber(summary.errors24h)} com erro`
                : "Nenhum erro registrado"
            }
            icon={<Activity />}
            tone={summary.errors24h > 0 ? "warning" : "neutral"}
            href="/logs-api"
          />
        </StatGrid>
      </div>

      <ProjectsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        customers={options.customers}
        companies={options.companies}
        canWrite={can(user.role, "projects:write")}
        canBlock={can(user.role, "projects:block")}
        openNew={params.novo === "1"}
      />
    </>
  );
}
