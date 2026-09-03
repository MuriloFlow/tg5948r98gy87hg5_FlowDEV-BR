import type { Metadata } from "next";
import { AlertTriangle, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { requireUser, can } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/format";
import type { ProjectEntitlement } from "@/lib/types";
import { AccessClient } from "./access-client";

export const metadata: Metadata = { title: "Controle de acesso" };
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  acesso?: string;
  modo?: string;
}

async function loadEntitlements(params: SearchParams) {
  return safeQuery(
    async () => {
      let query = db()
        .from("v_project_entitlement")
        .select("*")
        .neq("status", "ARCHIVED")
        .order("open_amount", { ascending: false })
        .limit(200);

      if (params.acesso === "bloqueado") query = query.eq("has_access", false);
      if (params.acesso === "liberado") query = query.eq("has_access", true);
      if (params.modo) query = query.eq("block_mode", params.modo);

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(
          `project_name.ilike.${like},project_code.ilike.${like},customer_name.ilike.${like}`
        );
      }

      const { data } = await query;

      return ((data ?? []) as ProjectEntitlement[]).map((row) => ({
        ...row,
        open_amount: Number(row.open_amount ?? 0),
        open_invoices: Number(row.open_invoices ?? 0),
        grace_days: Number(row.grace_days ?? 0),
        blocking_invoice_total:
          row.blocking_invoice_total != null ? Number(row.blocking_invoice_total) : null,
      }));
    },
    [] as ProjectEntitlement[]
  );
}

export default async function AccessControlPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const appUrl = env.publicAppUrl;

  const rows = await loadEntitlements(params);

  const blocked = rows.filter((row) => !row.has_access);
  const released = rows.length - blocked.length;
  const blockedAmount = blocked.reduce((sum, row) => sum + Number(row.open_amount ?? 0), 0);
  const manual = rows.filter((row) => row.block_mode === "MANUAL").length;

  return (
    <>
      <PageHeader
        title="Controle de acesso"
        description="Estado de entitlement de cada aplicação integrada: quem tem acesso, o que está travando e por quanto tempo."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Com acesso liberado"
            value={String(released)}
            hint="Aplicações operando normalmente"
            icon={<ShieldCheck />}
            tone="success"
          />
          <StatCard
            label="Sem acesso"
            value={String(blocked.length)}
            hint={blocked.length > 0 ? "Bloqueadas ou suspensas" : "Nenhuma aplicação travada"}
            icon={<ShieldAlert />}
            tone={blocked.length > 0 ? "danger" : "neutral"}
          />
          <StatCard
            label="Valor travado"
            value={formatCurrency(blockedAmount)}
            hint="Em aberto nos projetos bloqueados"
            icon={<Wallet />}
            tone={blockedAmount > 0 ? "warning" : "neutral"}
            href="/inadimplencia"
          />
          <StatCard
            label="Em modo manual"
            value={String(manual)}
            hint="Não bloqueiam sozinhos por inadimplência"
            icon={<AlertTriangle />}
            tone={manual > 0 ? "warning" : "neutral"}
          />
        </StatGrid>
      </div>

      <AccessClient
        rows={rows}
        appUrl={appUrl}
        canBlock={can(user.role, "projects:block")}
      />
    </>
  );
}
