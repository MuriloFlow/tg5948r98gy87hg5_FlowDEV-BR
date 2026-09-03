import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Hit {
  type: "customer" | "project" | "invoice";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  amount?: number | null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const term = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ results: [] });

  const like = `%${term}%`;
  const results: Hit[] = [];

  try {
    const client = db();
    const [customers, projects, invoices] = await Promise.all([
      client
        .from("customers")
        .select("id, name, code, email, document")
        .or(`name.ilike.${like},email.ilike.${like},document.ilike.${like},code.ilike.${like}`)
        .limit(5),
      client
        .from("projects")
        .select("id, name, code, primary_domain, status")
        .or(`name.ilike.${like},code.ilike.${like},primary_domain.ilike.${like},slug.ilike.${like}`)
        .limit(5),
      client
        .from("v_invoices_full")
        .select("id, code, description, total, customer_name, status")
        .or(`code.ilike.${like},description.ilike.${like},customer_name.ilike.${like}`)
        .limit(6),
    ]);

    for (const row of customers.data ?? []) {
      results.push({
        type: "customer",
        id: row.id,
        title: row.name,
        subtitle: `${row.code} · ${row.email}`,
        href: `/clientes/${row.id}`,
      });
    }

    for (const row of projects.data ?? []) {
      results.push({
        type: "project",
        id: row.id,
        title: row.name,
        subtitle: row.primary_domain ?? row.code,
        href: `/projetos/${row.id}`,
      });
    }

    for (const row of invoices.data ?? []) {
      results.push({
        type: "invoice",
        id: row.id,
        title: `${row.code} · ${row.description}`,
        subtitle: row.customer_name,
        href: `/cobrancas/${row.id}`,
        amount: Number(row.total ?? 0),
      });
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
