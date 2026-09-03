import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page-header";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { DocsClient } from "./docs-client";

export const metadata: Metadata = { title: "Documentação da API" };

export default function DocumentacaoPage() {
  return (
    <>
      <PageHeader
        title="Documentação da API"
        description="Referência completa da API REST do FlowDesk: autenticação por chave, cobranças, payment links, entitlement e webhooks assinados."
        meta={<Badge tone="violet" size="sm">v1</Badge>}
      />
      <DocsClient baseUrl={env.appUrl} sampleKey="fd_live_sk_xxxxxxxxxxxxxxxxxxxxxxxx" />
    </>
  );
}
