import type { Metadata } from "next";
import { syncFromCheckoutReturn } from "@/lib/payment-sync";
import { db } from "@/lib/db";
import { PaymentResultLive } from "../payment-result-live";

export const metadata: Metadata = { title: "Pagamento aprovado" };
export const dynamic = "force-dynamic";

async function loadContext(token: string) {
  try {
    const { data: link } = await db()
      .from("payment_links")
      .select("amount, project_id")
      .eq("token", token)
      .maybeSingle();
    if (!link) return { amount: 0, projectName: null as string | null };

    const { data: project } = await db()
      .from("projects")
      .select("name, status")
      .eq("id", link.project_id)
      .maybeSingle();

    return {
      amount: Number(link.amount),
      projectName: (project?.name as string | null) ?? null,
      blocksAccess: project?.status === "BLOCKED_PAYMENT",
    };
  } catch {
    return { amount: 0, projectName: null, blocksAccess: false };
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  await syncFromCheckoutReturn(query);
  const ctx = await loadContext(token);

  return (
    <PaymentResultLive
      variant="success"
      token={token}
      amount={ctx.amount}
      projectName={ctx.projectName}
      blocksAccess={ctx.blocksAccess}
    />
  );
}
