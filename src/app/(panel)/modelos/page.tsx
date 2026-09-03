import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard, StatGrid } from "@/components/panel/stat-card";
import { Mail, MessageCircle, MessageSquareText, Smartphone } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { db, safeQuery } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { TemplatesClient, type TemplateRow } from "./templates-client";

export const metadata: Metadata = { title: "Modelos de mensagem" };
export const dynamic = "force-dynamic";

async function loadTemplates(): Promise<TemplateRow[]> {
  return safeQuery(async () => {
    const { data } = await db()
      .from("message_templates")
      .select("*")
      .order("channel", { ascending: true })
      .order("name", { ascending: true });
    return (data ?? []) as TemplateRow[];
  }, []);
}

export default async function TemplatesPage() {
  await requirePermission("settings:manage");
  const templates = await loadTemplates();

  const byChannel = (channel: string) =>
    templates.filter((template) => template.channel === channel).length;

  return (
    <>
      <PageHeader
        title="Modelos de mensagem"
        description="Textos reutilizáveis de cobrança, aviso de vencimento e confirmação de pagamento."
      />

      <div className="mb-6">
        <StatGrid>
          <StatCard
            label="Modelos cadastrados"
            value={formatNumber(templates.length)}
            hint={`${templates.filter((t) => t.is_active).length} ativos`}
            icon={<MessageSquareText />}
            tone="info"
          />
          <StatCard label="E-mail" value={formatNumber(byChannel("email"))} icon={<Mail />} tone="violet" />
          <StatCard
            label="WhatsApp"
            value={formatNumber(byChannel("whatsapp"))}
            icon={<MessageCircle />}
            tone="success"
          />
          <StatCard label="SMS" value={formatNumber(byChannel("sms"))} icon={<Smartphone />} tone="neutral" />
        </StatGrid>
      </div>

      <TemplatesClient templates={templates} />
    </>
  );
}
