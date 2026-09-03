import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { BadgePercent, CalendarX, CheckCircle2, Ticket } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { CouponsClient, type CouponRow } from "./coupons-client";

export const metadata: Metadata = { title: "Cupons" };
export const dynamic = "force-dynamic";

async function loadCoupons(): Promise<CouponRow[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []) as CouponRow[];
  }, []);
}

function summarize(coupons: CouponRow[]) {
  const now = Date.now();

  return {
    active: coupons.filter(
      (coupon) =>
        coupon.is_active &&
        (!coupon.valid_until || new Date(coupon.valid_until).getTime() > now) &&
        (coupon.max_redemptions == null || coupon.redemptions < coupon.max_redemptions)
    ),
    expired: coupons.filter(
      (coupon) => coupon.valid_until && new Date(coupon.valid_until).getTime() <= now
    ),
    redemptions: coupons.reduce((sum, coupon) => sum + coupon.redemptions, 0),
  };
}

export default async function CouponsPage() {
  await requirePermission("billing:write");
  const coupons = await loadCoupons();
  const { active, expired, redemptions } = summarize(coupons);

  return (
    <>
      <PageHeader
        title="Cupons de desconto"
        description="Descontos promocionais aplicáveis a cobranças e payment links."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Cupons cadastrados"
            value={formatNumber(coupons.length)}
            icon={<Ticket />}
            tone="info"
          />
          <StatCard
            label="Disponíveis agora"
            value={formatNumber(active.length)}
            hint="Ativos, dentro da validade e com saldo"
            icon={<CheckCircle2 />}
            tone="success"
          />
          <StatCard
            label="Resgates totais"
            value={formatNumber(redemptions)}
            icon={<BadgePercent />}
            tone="violet"
          />
          <StatCard
            label="Expirados"
            value={formatNumber(expired.length)}
            icon={<CalendarX />}
            tone={expired.length > 0 ? "warning" : "neutral"}
          />
        </StatGrid>
      </div>

      <CouponsClient coupons={coupons} />
    </>
  );
}
