import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, User } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { requireUser, can } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env } from "@/lib/env";
import { projectStatusMeta } from "@/lib/labels";
import type {
  ActivityEntry,
  ApiKey,
  InvoiceFull,
  Project,
  ProjectEntitlement,
  ProjectHealth,
  WebhookEndpoint,
} from "@/lib/types";
import {
  ProjectHeaderActions,
  ProjectTabs,
  type ProjectDelivery,
} from "./project-tabs";
import type { CompanyOption, CustomerOption } from "../project-form";

export const metadata: Metadata = { title: "Projeto" };
export const dynamic = "force-dynamic";

async function loadProject(id: string): Promise<Project | null> {
  return safeQuery(async () => {
    const { data } = await db().from("projects").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const project = data as Project;
    return {
      ...project,
      monthly_amount: Number(project.monthly_amount ?? 0),
      contract_value: Number(project.contract_value ?? 0),
      grace_days: Number(project.grace_days ?? 0),
      domains: project.domains ?? [],
      tags: project.tags ?? [],
    };
  }, null);
}

async function loadRelated(project: Project) {
  return safeQuery(
    async () => {
      const [
        customer,
        entitlement,
        health,
        invoices,
        apiKeys,
        endpoints,
        activity,
        customers,
        companies,
      ] = await Promise.all([
        db()
          .from("customers")
          .select("id, name, email")
          .eq("id", project.customer_id)
          .maybeSingle(),
        db()
          .from("v_project_entitlement")
          .select("*")
          .eq("project_id", project.id)
          .maybeSingle(),
        db().from("v_project_health").select("*").eq("id", project.id).maybeSingle(),
        db()
          .from("v_invoices_full")
          .select("*")
          .eq("project_id", project.id)
          .order("due_date", { ascending: false })
          .limit(50),
        db()
          .from("api_keys")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false }),
        db()
          .from("webhook_endpoints")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false }),
        db()
          .from("activity_log")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false })
          .limit(25),
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

      const endpointRows = (endpoints.data ?? []) as WebhookEndpoint[];
      let deliveries: ProjectDelivery[] = [];

      if (endpointRows.length > 0) {
        const { data } = await db()
          .from("webhook_deliveries")
          .select("id, endpoint_id, event_type, attempt, status, response_status, duration_ms, created_at")
          .in(
            "endpoint_id",
            endpointRows.map((e) => e.id)
          )
          .order("created_at", { ascending: false })
          .limit(20);

        deliveries = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id),
          endpoint_id: String(row.endpoint_id),
          event_type: String(row.event_type),
          attempt: Number(row.attempt ?? 1),
          status: row.status as ProjectDelivery["status"],
          response_status: row.response_status != null ? Number(row.response_status) : null,
          duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
          created_at: String(row.created_at),
        }));
      }

      return {
        customer: (customer.data ?? null) as { id: string; name: string; email: string } | null,
        entitlement: (entitlement.data ?? null) as ProjectEntitlement | null,
        health: (health.data ?? null) as ProjectHealth | null,
        invoices: ((invoices.data ?? []) as InvoiceFull[]).map((invoice) => ({
          ...invoice,
          total: Number(invoice.total ?? 0),
          paid_amount: Number(invoice.paid_amount ?? 0),
          balance_due: Number(invoice.balance_due ?? 0),
        })),
        apiKeys: ((apiKeys.data ?? []) as ApiKey[]).map((key) => ({
          ...key,
          usage_count: Number(key.usage_count ?? 0),
          scopes: key.scopes ?? [],
          allowed_ips: key.allowed_ips ?? [],
          allowed_origins: key.allowed_origins ?? [],
        })),
        endpoints: endpointRows.map((endpoint) => ({
          ...endpoint,
          total_deliveries: Number(endpoint.total_deliveries ?? 0),
          events: endpoint.events ?? [],
        })),
        deliveries,
        activity: (activity.data ?? []) as ActivityEntry[],
        customers: (
          (customers.data ?? []) as { id: string; name: string; legal_name: string | null }[]
        ).map((c) => ({ id: c.id, name: c.legal_name || c.name }) satisfies CustomerOption),
        companies: (
          (companies.data ?? []) as {
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
    {
      customer: null as { id: string; name: string; email: string } | null,
      entitlement: null as ProjectEntitlement | null,
      health: null as ProjectHealth | null,
      invoices: [] as InvoiceFull[],
      apiKeys: [] as ApiKey[],
      endpoints: [] as WebhookEndpoint[],
      deliveries: [] as ProjectDelivery[],
      activity: [] as ActivityEntry[],
      customers: [] as CustomerOption[],
      companies: [] as CompanyOption[],
    }
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const appUrl = env.publicAppUrl;

  const project = await loadProject(id);
  if (!project) notFound();

  const related = await loadRelated(project);

  const permissions = {
    write: can(user.role, "projects:write"),
    block: can(user.role, "projects:block"),
    keys: can(user.role, "apikeys:manage"),
    webhooks: can(user.role, "webhooks:manage"),
  };

  return (
    <>
      <PageHeader
        backHref="/projetos"
        backLabel="Projetos"
        title={project.name}
        meta={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: project.color }}
            />
            <StatusBadge meta={projectStatusMeta(project.status)} />
          </span>
        }
        description={project.description ?? undefined}
        actions={
          <ProjectHeaderActions
            project={project}
            customers={related.customers}
            companies={related.companies}
            permissions={permissions}
          />
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-500">
        <span className="font-mono text-ink-400">{project.code}</span>

        {project.primary_domain && (
          <a
            href={`https://${project.primary_domain}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-600 transition-colors hover:text-brand-700"
          >
            {project.primary_domain}
            <ExternalLink className="size-3" />
          </a>
        )}

        {related.customer && (
          <Link
            href={`/clientes/${related.customer.id}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-brand-600"
          >
            <User className="size-3.5" />
            {related.customer.name}
          </Link>
        )}
      </div>

      <ProjectTabs
        project={project}
        customers={related.customers}
        companies={related.companies}
        permissions={permissions}
        entitlement={related.entitlement}
        health={related.health}
        invoices={related.invoices}
        apiKeys={related.apiKeys}
        endpoints={related.endpoints}
        deliveries={related.deliveries}
        activity={related.activity}
        appUrl={appUrl}
      />
    </>
  );
}
