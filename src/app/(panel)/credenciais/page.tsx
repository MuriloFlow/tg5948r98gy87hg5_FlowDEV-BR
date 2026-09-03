import type { Metadata } from "next";
import { Activity, Ban, Blocks, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/misc";
import { requireUser, can } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/format";
import type { ApiKey } from "@/lib/types";
import { ApiKeysTable, type ApiKeyRow } from "./api-keys-table";
import type { ProjectOption } from "./api-key-form";

export const metadata: Metadata = { title: "API Keys" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  projeto?: string;
  status?: string;
  ambiente?: string;
  page?: string;
  novo?: string;
}

async function loadKeys(params: SearchParams) {
  return safeQuery(
    async () => {
      const page = Math.max(1, Number(params.page ?? 1));
      const from = (page - 1) * PAGE_SIZE;

      let query = db()
        .from("api_keys")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (params.projeto) query = query.eq("project_id", params.projeto);
      if (params.status) query = query.eq("status", params.status);
      if (params.ambiente) query = query.eq("environment", params.ambiente);

      if (params.q) {
        const like = `%${params.q}%`;
        query = query.or(`name.ilike.${like},key_id.ilike.${like}`);
      }

      const { data, count } = await query;
      const keys = (data ?? []) as ApiKey[];

      if (keys.length === 0) return { rows: [] as ApiKeyRow[], total: count ?? 0, page };

      const projectIds = [...new Set(keys.map((k) => k.project_id))];
      const { data: projects } = await db()
        .from("projects")
        .select("id, name")
        .in("id", projectIds);

      const nameById = new Map(
        ((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
      );

      const rows: ApiKeyRow[] = keys.map((key) => ({
        ...key,
        usage_count: Number(key.usage_count ?? 0),
        project_name: nameById.get(key.project_id) ?? "Projeto removido",
      }));

      return { rows, total: count ?? 0, page };
    },
    { rows: [] as ApiKeyRow[], total: 0, page: 1 }
  );
}

async function loadSummary() {
  return safeQuery(
    async () => {
      const [{ data: keys }, { data: health }] = await Promise.all([
        db().from("api_keys").select("status, project_id, usage_count"),
        db().from("v_project_health").select("requests_24h"),
      ]);

      const list = (keys ?? []) as {
        status: string;
        project_id: string;
        usage_count: number;
      }[];

      return {
        active: list.filter((k) => k.status === "ACTIVE").length,
        revoked: list.filter((k) => k.status !== "ACTIVE").length,
        projects: new Set(list.filter((k) => k.status === "ACTIVE").map((k) => k.project_id)).size,
        requests24h: ((health ?? []) as { requests_24h: number }[]).reduce(
          (sum, h) => sum + Number(h.requests_24h ?? 0),
          0
        ),
      };
    },
    { active: 0, revoked: 0, projects: 0, requests24h: 0 }
  );
}

async function loadProjects(): Promise<ProjectOption[]> {
  return safeQuery(
    async () => {
      const { data } = await db()
        .from("projects")
        .select("id, name, environment")
        .neq("status", "ARCHIVED")
        .order("name")
        .limit(500);
      return (data ?? []) as ProjectOption[];
    },
    [] as ProjectOption[]
  );
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const appUrl = env.publicAppUrl;

  const [{ rows, total, page }, summary, projects] = await Promise.all([
    loadKeys(params),
    loadSummary(),
    loadProjects(),
  ]);

  const authSnippet = [
    `curl -s "${appUrl}/api/v1/entitlement" \\`,
    `  -H "Authorization: Bearer $FLOWDESK_API_KEY"`,
  ].join("\n");

  return (
    <>
      <PageHeader
        title="Credenciais de API"
        description="Chaves secretas usadas pelas aplicações integradas. O secret é exibido apenas na criação — o banco guarda somente o hash SHA-256."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Chaves ativas"
            value={String(summary.active)}
            hint="Autenticando requisições agora"
            icon={<KeyRound />}
            tone="success"
          />
          <StatCard
            label="Projetos integrados"
            value={String(summary.projects)}
            hint="Com ao menos uma chave ativa"
            icon={<Blocks />}
            tone="info"
            href="/projetos"
          />
          <StatCard
            label="Chamadas (24h)"
            value={formatNumber(summary.requests24h)}
            hint="Somando todos os projetos"
            icon={<Activity />}
            tone="violet"
            href="/logs-api"
          />
          <StatCard
            label="Revogadas / expiradas"
            value={String(summary.revoked)}
            hint="Não autenticam mais"
            icon={<Ban />}
            tone="neutral"
          />
        </StatGrid>
      </div>

      <ApiKeysTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        projects={projects}
        appUrl={appUrl}
        canManage={can(user.role, "apikeys:manage")}
        defaultProjectId={params.projeto ?? null}
        openNew={params.novo === "1"}
      />

      <Card className="mt-6">
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Como autenticar</CardTitle>
            <p className="text-[12.5px] text-ink-500">
              Envie o secret no header <code className="font-mono">Authorization</code> em toda
              chamada. Nunca exponha a chave no front-end.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock code={authSnippet} filename="terminal" />
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-600">
            <li>
              • O <span className="font-medium text-ink-800">key id</span> (
              <code className="font-mono text-[11.5px]">fd_live_pk_…</code>) é público e pode
              aparecer em logs; o secret (
              <code className="font-mono text-[11.5px]">fd_live_sk_…</code>) não.
            </li>
            <li>
              • Cada chave respeita o próprio limite por minuto — estourar devolve{" "}
              <code className="font-mono text-[11.5px]">429</code> com{" "}
              <code className="font-mono text-[11.5px]">Retry-After</code>.
            </li>
            <li>
              • Perdeu o secret? Rotacione a chave: um novo valor é gerado e o anterior deixa de
              funcionar imediatamente.
            </li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
