import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Pulso" barato para atualização em tempo real: devolve uma assinatura que só
 * muda quando algo relevante mudou. O cliente compara e chama router.refresh().
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const client = db();
    const [invoices, payments, events, notifications, projects] = await Promise.all([
      client.from("invoices").select("updated_at").order("updated_at", { ascending: false }).limit(1),
      client.from("payments").select("updated_at").order("updated_at", { ascending: false }).limit(1),
      client.from("events").select("created_at").order("created_at", { ascending: false }).limit(1),
      client.from("notifications").select("created_at").order("created_at", { ascending: false }).limit(1),
      client.from("projects").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    ]);

    const parts = [
      invoices.data?.[0]?.updated_at,
      payments.data?.[0]?.updated_at,
      events.data?.[0]?.created_at,
      notifications.data?.[0]?.created_at,
      projects.data?.[0]?.updated_at,
    ].join("|");

    return NextResponse.json(
      { signature: createHash("sha1").update(parts).digest("hex"), at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ signature: "offline" }, { headers: { "Cache-Control": "no-store" } });
  }
}
