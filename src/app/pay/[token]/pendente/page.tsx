import type { Metadata } from "next";
import { syncFromCheckoutReturn } from "@/lib/payment-sync";
import { PaymentResultLive } from "../payment-result-live";

export const metadata: Metadata = { title: "Pagamento em processamento" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  await syncFromCheckoutReturn(query);

  return <PaymentResultLive variant="pending" token={token} />;
}
