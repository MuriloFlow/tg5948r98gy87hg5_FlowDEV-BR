import "server-only";
import { db, safeQuery } from "./db";
import { EMPTY_COUNTERS, type NavCounters } from "./navigation";
import type {
  ActivityEntry,
  AppNotification,
  FinancialSummary,
  FlowEvent,
  InvoiceFull,
  MonthlyRevenue,
  Payment,
  ProjectHealth,
} from "./types";

const EMPTY_SUMMARY: FinancialSummary = {
  total_received: 0,
  total_to_receive: 0,
  total_overdue: 0,
  received_this_month: 0,
  due_this_month: 0,
  overdue_count: 0,
  open_count: 0,
  paid_count: 0,
};

function countQuery(table: string) {
  return db().from(table).select("id", { count: "exact", head: true });
}

type CountQuery = ReturnType<typeof countQuery>;

async function count(table: string, apply: (query: CountQuery) => CountQuery): Promise<number> {
  const { count: total } = await apply(countQuery(table));
  return total ?? 0;
}

export async function getNavCounters(): Promise<NavCounters> {
  return safeQuery(async () => {
    const [overdue, blocked, unread, failed] = await Promise.all([
      count("invoices", (q) => q.eq("status", "OVERDUE")),
      count("projects", (q) => q.eq("status", "BLOCKED_PAYMENT")),
      count("notifications", (q) => q.is("read_at", null)),
      count("webhook_deliveries", (q) => q.in("status", ["FAILED", "RETRYING"])),
    ]);

    return {
      overdue,
      blocked,
      unreadNotifications: unread,
      failedWebhooks: failed,
    };
  }, EMPTY_COUNTERS);
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  return safeQuery(async () => {
    const { data } = await db().from("v_financial_summary").select("*").maybeSingle();
    if (!data) return EMPTY_SUMMARY;
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, Number(v ?? 0)])
    ) as unknown as FinancialSummary;
  }, EMPTY_SUMMARY);
}

export async function getMonthlyRevenue(): Promise<MonthlyRevenue[]> {
  return safeQuery(async () => {
    const { data } = await db().from("v_monthly_revenue").select("*");
    return (data ?? []).map((row: Record<string, unknown>) => ({
      month: String(row.month),
      label: String(row.label),
      received: Number(row.received ?? 0),
      expected: Number(row.expected ?? 0),
      overdue: Number(row.overdue ?? 0),
    }));
  }, []);
}

export async function getRecentInvoices(limit = 8): Promise<InvoiceFull[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("v_invoices_full")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as InvoiceFull[];
  }, []);
}

export async function getOverdueInvoices(limit = 10): Promise<InvoiceFull[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("v_invoices_full")
      .select("*")
      .in("status", ["OVERDUE", "EXPIRED"])
      .order("due_date", { ascending: true })
      .limit(limit);
    return (data ?? []) as InvoiceFull[];
  }, []);
}

export async function getUpcomingInvoices(limit = 10): Promise<InvoiceFull[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("v_invoices_full")
      .select("*")
      .in("status", ["OPEN", "PENDING"])
      .gte("due_date", new Date().toISOString().slice(0, 10))
      .order("due_date", { ascending: true })
      .limit(limit);
    return (data ?? []) as InvoiceFull[];
  }, []);
}

export async function getRecentPayments(limit = 8): Promise<Payment[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as Payment[];
  }, []);
}

export async function getProjectHealth(limit = 50): Promise<ProjectHealth[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("v_project_health")
      .select("*")
      .order("open_amount", { ascending: false })
      .limit(limit);
    return (data ?? []) as ProjectHealth[];
  }, []);
}

export async function getRecentEvents(limit = 20): Promise<FlowEvent[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as FlowEvent[];
  }, []);
}

export async function getRecentActivity(limit = 25): Promise<ActivityEntry[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as ActivityEntry[];
  }, []);
}

export async function getNotifications(limit = 30): Promise<AppNotification[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as AppNotification[];
  }, []);
}

/** Contagens simples usadas nos cabeçalhos de cada listagem. */
export async function getEntityCounts() {
  return safeQuery(async () => {
    const [customers, projects, invoices, links, payments, subscriptions] = await Promise.all([
      count("customers", (q) => q.neq("status", "ARCHIVED")),
      count("projects", (q) => q.neq("status", "ARCHIVED")),
      count("invoices", (q) => q),
      count("payment_links", (q) => q.eq("status", "ACTIVE")),
      count("payments", (q) => q.eq("status", "APPROVED")),
      count("subscriptions", (q) => q.eq("status", "ACTIVE")),
    ]);
    return { customers, projects, invoices, links, payments, subscriptions };
  }, { customers: 0, projects: 0, invoices: 0, links: 0, payments: 0, subscriptions: 0 });
}
