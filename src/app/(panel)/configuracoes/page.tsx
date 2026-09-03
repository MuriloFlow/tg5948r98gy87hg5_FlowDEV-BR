import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { can, requireUser } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import {
  SettingsClient,
  type BillingDefaults,
  type CompanyProfile,
  type SessionRow,
  type UserProfile,
} from "./settings-client";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const EMPTY_COMPANY: CompanyProfile = {
  legal_name: "",
  trade_name: "",
  document: "",
  email: "",
  phone: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  logo_url: "",
  statement_descriptor: "FLOWDESK",
  description: "",
};

const EMPTY_BILLING: BillingDefaults = {
  grace_days: 3,
  due_day: 10,
  payment_methods: ["PIX", "CREDIT_CARD", "BOLETO"],
  max_installments: 12,
  late_fee_percent: 2,
  interest_percent_month: 1,
  expires_after_days: 30,
};

async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  return safeQuery(async () => {
    const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
    if (!data?.value) return fallback;
    return { ...fallback, ...(data.value as Partial<T>) };
  }, fallback);
}

async function loadSessions(userId: string): Promise<SessionRow[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("admin_sessions")
      .select("id, ip, user_agent, last_seen_at, created_at, expires_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(30);
    return (data ?? []) as SessionRow[];
  }, []);
}

export default async function SettingsPage() {
  const user = await requireUser();

  const [company, billing, sessions] = await Promise.all([
    loadSetting<CompanyProfile>("company_profile", EMPTY_COMPANY),
    loadSetting<BillingDefaults>("billing_defaults", EMPTY_BILLING),
    loadSessions(user.id),
  ]);

  const profile: UserProfile = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar_url: user.avatar_url,
    timezone: user.timezone,
    role: user.role,
    two_factor_enabled: user.two_factor_enabled,
    must_change_password: user.must_change_password,
    last_login_at: user.last_login_at,
    preferences: {
      table_density: String(
        (user.preferences as Record<string, unknown>)?.table_density ?? "comfortable"
      ),
      home_page: String((user.preferences as Record<string, unknown>)?.home_page ?? "/dashboard"),
    },
  };

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Sua conta, os dados do emissor das cobranças e os padrões aplicados a novas faturas."
      />

      <SettingsClient
        profile={profile}
        company={company}
        billing={billing}
        sessions={sessions}
        currentSessionId={user.session_id}
        canManageSettings={can(user.role, "settings:manage")}
      />
    </>
  );
}
