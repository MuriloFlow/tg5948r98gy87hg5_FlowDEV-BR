import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 15), 50);

  try {
    const { data } = await db()
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    return NextResponse.json({ notifications: data ?? [] });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
  };

  try {
    if (body.action === "read_all") {
      await db()
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "read" && body.id) {
      await db()
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "ação inválida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
