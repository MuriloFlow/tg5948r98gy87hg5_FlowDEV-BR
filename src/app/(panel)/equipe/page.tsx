import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { KeyRound, ShieldCheck, UserMinus, UsersRound } from "lucide-react";
import { permissionsFor, requirePermission, type Permission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import type { AdminRole } from "@/lib/types";
import { TeamClient, type TeamMember } from "./team-client";

export const metadata: Metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

const ROLES: AdminRole[] = ["OWNER", "ADMIN", "FINANCE", "SUPPORT", "READONLY"];

async function loadMembers(): Promise<TeamMember[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("admin_users")
      .select(
        "id, name, email, role, status, avatar_url, phone, timezone, last_login_at, last_login_ip, must_change_password, two_factor_enabled, created_at"
      )
      .order("created_at", { ascending: true });

    const members = (data ?? []) as TeamMember[];
    if (members.length === 0) return members;

    const { data: sessions } = await db()
      .from("admin_sessions")
      .select("user_id")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());

    const counts = new Map<string, number>();
    for (const row of (sessions ?? []) as { user_id: string }[]) {
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    }

    for (const member of members) {
      member.active_sessions = counts.get(member.id) ?? 0;
    }

    return members;
  }, []);
}

export default async function TeamPage() {
  const user = await requirePermission("team:manage");
  const members = await loadMembers();

  const active = members.filter((member) => member.status === "ACTIVE");
  const owners = active.filter((member) => member.role === "OWNER");
  const pending = members.filter((member) => member.must_change_password);
  const sessions = members.reduce((sum, member) => sum + (member.active_sessions ?? 0), 0);

  const rolePermissions = Object.fromEntries(
    ROLES.map((role) => [role, permissionsFor(role)])
  ) as Record<AdminRole, Permission[]>;

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem tem acesso ao painel, com qual papel e o que cada papel pode fazer."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Usuários ativos"
            value={formatNumber(active.length)}
            hint={`${members.length} cadastrados no total`}
            icon={<UsersRound />}
            tone="info"
          />
          <StatCard
            label="Proprietários"
            value={formatNumber(owners.length)}
            hint="Acesso total ao sistema"
            icon={<ShieldCheck />}
            tone="violet"
          />
          <StatCard
            label="Sessões ativas"
            value={formatNumber(sessions)}
            hint="Logins válidos neste momento"
            icon={<KeyRound />}
            tone="success"
          />
          <StatCard
            label="Senha provisória"
            value={formatNumber(pending.length)}
            hint={
              pending.length > 0
                ? "Usuários que ainda não trocaram a senha"
                : "Todos com senha definitiva"
            }
            icon={<UserMinus />}
            tone={pending.length > 0 ? "warning" : "neutral"}
          />
        </StatGrid>
      </div>

      <TeamClient
        members={members}
        currentUserId={user.id}
        rolePermissions={rolePermissions}
      />
    </>
  );
}
