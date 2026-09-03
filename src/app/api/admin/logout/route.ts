import { NextResponse } from "next/server";
import { destroySession, getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (user) {
    await audit({
      action: "auth.logout",
      entityType: "admin_user",
      entityId: user.id,
      entityLabel: user.email,
      actorId: user.id,
      actorLabel: user.name,
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
