import type { Metadata } from "next";
import { PaymentResultLive } from "../payment-result-live";

export const metadata: Metadata = { title: "Pagamento não concluído" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PaymentResultLive variant="failure" token={token} />;
}
