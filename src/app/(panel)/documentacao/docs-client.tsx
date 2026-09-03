"use client";

import * as React from "react";
import {
  BookOpen,
  Braces,
  KeyRound,
  Link2,
  Radio,
  Receipt,
  ShieldCheck,
  Terminal,
  Webhook,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, CodeBlock, CopyButton } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */

const SECTIONS = [
  { id: "inicio", label: "Começando", icon: BookOpen },
  { id: "autenticacao", label: "Autenticação", icon: KeyRound },
  { id: "entitlement", label: "Entitlement", icon: ShieldCheck },
  { id: "charges", label: "Cobranças", icon: Receipt },
  { id: "links", label: "Payment Links", icon: Link2 },
  { id: "payments", label: "Pagamentos", icon: Zap },
  { id: "events", label: "Eventos", icon: Radio },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "errors", label: "Erros e limites", icon: Braces },
  { id: "integracao", label: "Integrar um projeto", icon: Terminal },
] as const;

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const METHOD_TONE: Record<Method, string> = {
  GET: "bg-sky-50 text-sky-700 ring-sky-200",
  POST: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PATCH: "bg-amber-50 text-amber-700 ring-amber-200",
  DELETE: "bg-rose-50 text-rose-700 ring-rose-200",
};

function Endpoint({
  method,
  path,
  children,
  baseUrl,
}: {
  method: Method;
  path: string;
  children?: React.ReactNode;
  baseUrl: string;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white">
      <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ring-1 ring-inset",
            METHOD_TONE[method]
          )}
        >
          {method}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-800">{path}</code>
        <CopyButton value={`${baseUrl}${path}`} label="Copiar URL" />
      </div>
      {children && <div className="space-y-3 px-4 py-4">{children}</div>}
    </div>
  );
}

function Params({
  rows,
}: {
  rows: { name: string; type: string; required?: boolean; description: string }[];
}) {
  return (
    <TableWrap className="border-ink-100">
      <Table>
        <THead>
          <TR>
            <TH className="w-[190px]">Campo</TH>
            <TH className="w-[120px]">Tipo</TH>
            <TH>Descrição</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.name}>
              <TD className="align-top">
                <span className="font-mono text-[12px] text-ink-900">{row.name}</span>
                {row.required && (
                  <span className="ml-1.5 text-[10.5px] font-semibold uppercase text-rose-500">
                    obrig.
                  </span>
                )}
              </TD>
              <TD className="align-top font-mono text-[11.5px] text-ink-500">{row.type}</TD>
              <TD className="align-top text-[12.5px] leading-relaxed text-ink-600">
                {row.description}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.018em] text-ink-900">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function DocsClient({
  baseUrl,
  sampleKey,
}: {
  baseUrl: string;
  sampleKey: string;
}) {
  const [active, setActive] = React.useState<string>("inicio");

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const api = `${baseUrl}/api/v1`;

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* índice lateral */}
      <nav className="hidden lg:block">
        <div className="sticky top-24 space-y-0.5">
          <p className="mb-2 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Nesta página
          </p>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors duration-150",
                active === id
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="min-w-0 space-y-12">
        {/* ------------------------------------------------------- começando */}
        <Section
          id="inicio"
          title="Começando"
          description="A API do FlowDesk é REST, aceita e devolve JSON e usa códigos HTTP convencionais. Toda requisição é autenticada por uma chave secreta ligada a um único projeto — a chave define automaticamente o escopo dos dados."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-[13.5px]">URL base</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-800">
                    {api}
                  </code>
                  <CopyButton value={api} />
                </div>
                <p className="mt-2.5 text-[12px] leading-relaxed text-ink-500">
                  Em desenvolvimento use <Code>http://localhost:3000/api/v1</Code>.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-[13.5px]">Convenções</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-600">
                  <li>Valores monetários em reais, com decimais (<Code>149.90</Code>).</li>
                  <li>Datas em <Code>YYYY-MM-DD</Code>; timestamps em ISO 8601 UTC.</li>
                  <li>Listas vêm em envelope com <Code>data</Code> e <Code>pagination</Code>.</li>
                  <li>IDs são UUID; cobranças também têm um <Code>code</Code> legível.</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <CodeBlock
            filename="Primeira chamada"
            language="bash"
            code={`curl ${api}/ping \\
  -H "Authorization: Bearer ${sampleKey}"`}
          />
        </Section>

        {/* ---------------------------------------------------------- auth */}
        <Section
          id="autenticacao"
          title="Autenticação"
          description="Cada projeto tem um par de chaves. A pública identifica o projeto em contextos não sensíveis; a secreta autentica as chamadas de servidor e é exibida uma única vez, no momento da criação."
        >
          <CodeBlock
            language="bash"
            code={`# Header recomendado
Authorization: Bearer ${sampleKey}

# Alternativa aceita
X-API-Key: ${sampleKey}`}
          />

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-amber-800">
              <strong className="font-semibold">Nunca exponha a chave secreta no navegador.</strong>{" "}
              Use-a apenas em rotas de servidor, Server Actions ou back-ends. Se ela vazar, revogue
              em <Code>Credenciais</Code> e gere outra — a antiga para de funcionar na hora.
            </p>
          </div>

          <Params
            rows={[
              {
                name: "fd_live_sk_…",
                type: "chave",
                description: "Ambiente de produção. Movimenta dinheiro de verdade.",
              },
              {
                name: "fd_test_sk_…",
                type: "chave",
                description: "Ambiente de testes, isolado do financeiro real.",
              },
              {
                name: "fd_live_pk_…",
                type: "chave",
                description:
                  "Chave pública, só identifica o projeto. Pode aparecer no cliente.",
              },
              {
                name: "Idempotency-Key",
                type: "header",
                description:
                  "Opcional em POST. Repetir a mesma chave devolve a resposta original em vez de duplicar a cobrança.",
              },
            ]}
          />
        </Section>

        {/* --------------------------------------------------- entitlement */}
        <Section
          id="entitlement"
          title="Entitlement — liberar ou bloquear o sistema"
          description="É o endpoint mais importante da integração. Sua aplicação pergunta ao FlowDesk se o cliente está em dia; se não estiver, você troca a interface pela tela de bloqueio com o link de pagamento já pronto."
        >
          <Endpoint method="GET" path="/api/v1/entitlement" baseUrl={baseUrl}>
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              Devolve o status de acesso do projeto da chave. Quando há uma cobrança bloqueante, o
              FlowDesk garante um Payment Link ativo e já retorna a URL do checkout.
            </p>
          </Endpoint>

          <CodeBlock
            filename="Resposta"
            language="json"
            code={`{
  "object": "entitlement",
  "project": { "id": "…", "code": "PRJ-0001", "name": "Total Flex OS", "domain": "mecanicatotalflex.com.br" },
  "status": "BLOCKED_PAYMENT",
  "has_access": false,
  "blocked": true,
  "blocked_reason": "Cobrança COB-0007 vencida há 9 dias",
  "grace_days": 3,
  "customer": { "id": "…", "name": "Carlos Menezes", "email": "financeiro@…" },
  "open_invoices": 1,
  "open_amount": 490,
  "charge": {
    "id": "…",
    "code": "COB-0007",
    "description": "Mensalidade Total Flex OS",
    "amount": 490,
    "due_date": "2026-08-05",
    "payment_url": "${baseUrl}/pay/pl_9f2c…",
    "checkout_url": "https://www.mercadopago.com.br/checkout/…"
  },
  "checked_at": "2026-09-02T13:04:11.204Z"
}`}
          />

          <Params
            rows={[
              {
                name: "status",
                type: "enum",
                description:
                  "ACTIVE, TRIAL, GRACE, BLOCKED_PAYMENT, SUSPENDED, CANCELED ou ARCHIVED.",
              },
              {
                name: "has_access",
                type: "boolean",
                description: "Fonte da verdade: se for false, mostre a tela de bloqueio.",
              },
              {
                name: "charge.payment_url",
                type: "string | null",
                description: "Link de checkout hospedado pelo FlowDesk. Use no botão de pagamento.",
              },
            ]}
          />

          <div className="rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Fail-open.</strong> Se o FlowDesk
              estiver indisponível, libere o acesso. Uma indisponibilidade nossa nunca deve derrubar
              o sistema do seu cliente. Cache a resposta por 30–60 segundos.
            </p>
          </div>
        </Section>

        {/* ------------------------------------------------------- charges */}
        <Section
          id="charges"
          title="Cobranças"
          description="Cobranças (charges) são as faturas do projeto. Criar uma cobrança já gera automaticamente um Payment Link pronto para envio."
        >
          <Endpoint method="GET" path="/api/v1/charges" baseUrl={baseUrl}>
            <Params
              rows={[
                { name: "status", type: "string", description: "Filtra por status. Aceita lista separada por vírgula." },
                { name: "customer_id", type: "uuid", description: "Restringe a um cliente." },
                { name: "due_before / due_after", type: "date", description: "Janela de vencimento." },
                { name: "limit / offset", type: "int", description: "Paginação. Limite máximo de 100." },
              ]}
            />
          </Endpoint>

          <Endpoint method="POST" path="/api/v1/charges" baseUrl={baseUrl}>
            <Params
              rows={[
                { name: "amount", type: "number", required: true, description: "Valor total em reais." },
                { name: "description", type: "string", required: true, description: "Aparece no checkout e no e-mail." },
                { name: "due_date", type: "date", required: true, description: "Data de vencimento." },
                { name: "is_mandatory", type: "boolean", description: "Se true, o atraso bloqueia o projeto após a carência." },
                { name: "payment_methods", type: "string[]", description: "PIX, CREDIT_CARD, BOLETO. Padrão: todos." },
                { name: "max_installments", type: "int", description: "Parcelamento no cartão. Padrão: 1." },
                { name: "expires_at", type: "datetime", description: "Quando a cobrança expira e não pode mais ser paga." },
                { name: "metadata", type: "object", description: "Chave/valor livre, devolvido nos webhooks." },
              ]}
            />
          </Endpoint>

          <CodeBlock
            filename="Criar cobrança"
            language="bash"
            code={`curl -X POST ${api}/charges \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: fatura-2026-09" \\
  -d '{
    "amount": 490.00,
    "description": "Mensalidade Setembro/2026",
    "due_date": "2026-09-05",
    "is_mandatory": true,
    "payment_methods": ["PIX", "CREDIT_CARD", "BOLETO"],
    "metadata": { "competencia": "2026-09" }
  }'`}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Endpoint method="GET" path="/api/v1/charges/{id}" baseUrl={baseUrl} />
            <Endpoint method="POST" path="/api/v1/charges/{id}/cancel" baseUrl={baseUrl} />
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-500">
            <Code>{"{id}"}</Code> aceita tanto o UUID quanto o código legível
            (<Code>COB-0007</Code>). Cobranças já pagas não podem ser canceladas — nesse caso use um
            reembolso pelo painel.
          </p>
        </Section>

        {/* --------------------------------------------------------- links */}
        <Section
          id="links"
          title="Payment Links"
          description="Links únicos e hospedados por nós, com Pix, cartão e boleto na mesma tela. Podem nascer de uma cobrança existente ou ser avulsos."
        >
          <Endpoint method="POST" path="/api/v1/payment-links" baseUrl={baseUrl}>
            <Params
              rows={[
                { name: "charge_id", type: "uuid", description: "Gera o link a partir de uma cobrança. Dispensa amount e title." },
                { name: "amount", type: "number", description: "Obrigatório em links avulsos." },
                { name: "title", type: "string", description: "Obrigatório em links avulsos." },
                { name: "expires_at", type: "datetime", description: "Validade do link." },
                { name: "max_uses", type: "int", description: "Quantos pagamentos o link aceita. Padrão: 1." },
              ]}
            />
          </Endpoint>
          <Endpoint method="GET" path="/api/v1/payment-links" baseUrl={baseUrl} />
          <CodeBlock
            filename="Resposta"
            language="json"
            code={`{
  "object": "payment_link",
  "token": "pl_9f2c7d1e…",
  "short_code": "A7K2QX",
  "url": "${baseUrl}/pay/pl_9f2c7d1e…",
  "amount": 490,
  "status": "ACTIVE",
  "expires_at": "2026-10-05T02:59:59.000Z"
}`}
          />
        </Section>

        {/* ------------------------------------------------------ payments */}
        <Section
          id="payments"
          title="Pagamentos"
          description="Transações confirmadas pelo gateway. São criadas pelo FlowDesk, nunca pela sua aplicação — você apenas consulta."
        >
          <Endpoint method="GET" path="/api/v1/payments" baseUrl={baseUrl}>
            <Params
              rows={[
                { name: "status", type: "string", description: "PENDING, APPROVED, REJECTED, REFUNDED, CANCELED, CHARGEBACK." },
                { name: "charge_id", type: "uuid", description: "Pagamentos de uma cobrança específica." },
                { name: "from / to", type: "date", description: "Janela de criação." },
              ]}
            />
          </Endpoint>
        </Section>

        {/* -------------------------------------------------------- events */}
        <Section
          id="events"
          title="Eventos"
          description="Tudo que acontece no projeto vira um evento. Consuma por webhook (recomendado) ou por polling neste endpoint."
        >
          <Endpoint method="GET" path="/api/v1/events" baseUrl={baseUrl}>
            <Params
              rows={[
                { name: "type", type: "string", description: "Filtra por tipo. Aceita lista separada por vírgula." },
                { name: "after", type: "datetime", description: "Só eventos criados depois deste instante." },
              ]}
            />
          </Endpoint>

          <TableWrap className="border-ink-100">
            <Table>
              <THead>
                <TR>
                  <TH className="w-[220px]">Evento</TH>
                  <TH>Quando dispara</TH>
                </TR>
              </THead>
              <TBody>
                {[
                  ["payment.created", "Uma tentativa de pagamento foi iniciada no checkout."],
                  ["payment.pending", "Pix aguardando pagamento ou boleto emitido."],
                  ["payment.paid", "Pagamento aprovado. É o gatilho de liberação."],
                  ["payment.failed", "Cartão recusado ou pagamento cancelado."],
                  ["payment.refunded", "Estorno total ou parcial processado."],
                  ["payment.expired", "Pix ou boleto venceu sem pagamento."],
                  ["charge.created", "Nova cobrança emitida."],
                  ["charge.paid", "Cobrança quitada integralmente."],
                  ["charge.overdue", "Cobrança passou do vencimento."],
                  ["charge.canceled", "Cobrança cancelada."],
                  ["project.blocked", "Acesso do projeto suspenso por inadimplência."],
                  ["project.unblocked", "Acesso restabelecido após pagamento."],
                ].map(([type, when]) => (
                  <TR key={type}>
                    <TD>
                      <code className="font-mono text-[12px] text-brand-700">{type}</code>
                    </TD>
                    <TD className="text-[12.5px] text-ink-600">{when}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Section>

        {/* ------------------------------------------------------ webhooks */}
        <Section
          id="webhooks"
          title="Webhooks assinados"
          description="Cadastre um endpoint em Webhooks e o FlowDesk entrega cada evento com assinatura HMAC-SHA256. Falhas são reprocessadas com backoff progressivo."
        >
          <CodeBlock
            filename="Headers da entrega"
            language="http"
            code={`POST /webhooks/flowdesk HTTP/1.1
Content-Type: application/json
X-FlowDesk-Event: payment.paid
X-FlowDesk-Delivery: 3f9a…
X-FlowDesk-Timestamp: 1788352451
X-FlowDesk-Signature: t=1788352451,v1=8c1f2a…`}
          />

          <CodeBlock
            filename="Verificando a assinatura (Node.js)"
            language="typescript"
            code={`import crypto from "node:crypto";

export function verify(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string])
  );
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest("hex");

  // rejeita entregas com mais de 5 minutos (proteção contra replay)
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1)
  );
}`}
          />

          <div className="rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              Responda <Code>2xx</Code> em até 10 segundos. Qualquer outra coisa é tratada como
              falha e reenviada. Processe de forma idempotente: use o
              <Code>X-FlowDesk-Delivery</Code> para descartar duplicatas.
            </p>
          </div>
        </Section>

        {/* -------------------------------------------------------- errors */}
        <Section
          id="errors"
          title="Erros e limites"
          description="Erros seguem um formato único, com tipo legível por máquina e mensagem em português pronta para exibir."
        >
          <CodeBlock
            language="json"
            code={`{
  "error": {
    "type": "validation_error",
    "code": "invalid_amount",
    "message": "O valor da cobrança deve ser maior que zero.",
    "param": "amount",
    "request_id": "req_8f21c9…"
  }
}`}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <TableWrap className="border-ink-100">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-[70px]">HTTP</TH>
                    <TH>Significado</TH>
                  </TR>
                </THead>
                <TBody>
                  {[
                    ["400", "Payload inválido"],
                    ["401", "Chave ausente, inválida ou revogada"],
                    ["403", "Chave sem permissão para o recurso"],
                    ["404", "Recurso não encontrado no projeto"],
                    ["409", "Conflito (ex.: cobrança já paga)"],
                    ["429", "Rate limit excedido"],
                    ["500", "Erro interno — tente novamente"],
                  ].map(([code, meaning]) => (
                    <TR key={code}>
                      <TD className="font-mono text-[12px] text-ink-900">{code}</TD>
                      <TD className="text-[12.5px] text-ink-600">{meaning}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>

            <Card>
              <CardHeader>
                <CardTitle className="text-[13.5px]">Rate limit</CardTitle>
                <CardDescription>Por chave, em janela deslizante de 1 minuto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] text-ink-500">Padrão</span>
                  <span className="text-[13px] font-semibold text-ink-900">120 req/min</span>
                </div>
                <p className="text-[12px] leading-relaxed text-ink-500">
                  Configurável por chave em <Code>Credenciais</Code>. As respostas trazem
                  <Code>X-RateLimit-Limit</Code>, <Code>X-RateLimit-Remaining</Code> e
                  <Code>Retry-After</Code>.
                </p>
                <Badge tone="neutral" size="sm">
                  Todas as requisições ficam em Logs da API
                </Badge>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------- integração */}
        <Section
          id="integracao"
          title="Integrar um projeto em 4 passos"
          description="Receita completa para plugar o bloqueio por inadimplência em qualquer aplicação Next.js."
        >
          <ol className="space-y-4">
            {[
              {
                title: "Gere a chave secreta",
                body: (
                  <>
                    No painel, vá em <Code>Credenciais</Code> → <Code>Nova chave</Code>, escolha o
                    projeto e o ambiente. A chave aparece uma única vez — copie e guarde.
                  </>
                ),
              },
              {
                title: "Configure as variáveis de ambiente",
                body: (
                  <CodeBlock
                    language="bash"
                    code={`FLOWDESK_SECRET_KEY=${sampleKey}
FLOWDESK_API_URL=${baseUrl}
FLOWDESK_MODE=enforce   # enforce | monitor | off`}
                  />
                ),
              },
              {
                title: "Consulte o entitlement no servidor",
                body: (
                  <CodeBlock
                    language="typescript"
                    filename="src/lib/flowdesk.ts"
                    code={`import "server-only";

export async function checkAccess() {
  try {
    const res = await fetch(\`\${process.env.FLOWDESK_API_URL}/api/v1/entitlement\`, {
      headers: { Authorization: \`Bearer \${process.env.FLOWDESK_SECRET_KEY}\` },
      next: { revalidate: 60, tags: ["flowdesk-entitlement"] },
    });
    if (!res.ok) return { allowed: true, entitlement: null }; // fail-open
    const entitlement = await res.json();
    return { allowed: entitlement.has_access !== false, entitlement };
  } catch {
    return { allowed: true, entitlement: null }; // fail-open
  }
}`}
                  />
                ),
              },
              {
                title: "Troque a interface quando estiver bloqueado",
                body: (
                  <CodeBlock
                    language="tsx"
                    filename="src/app/layout.tsx"
                    code={`export default async function RootLayout({ children }) {
  const { allowed, entitlement } = await checkAccess();

  return (
    <html lang="pt-BR">
      <body>
        {allowed ? children : <BlockedScreen entitlement={entitlement} />}
      </body>
    </html>
  );
}`}
                  />
                ),
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11.5px] font-semibold text-brand-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[13.5px] font-medium text-ink-900">{step.title}</p>
                  <div className="text-[12.5px] leading-relaxed text-ink-600">{step.body}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-emerald-800">
              <strong className="font-semibold">Liberação automática.</strong> Quando o Mercado Pago
              confirma o pagamento, o webhook quita a cobrança, o FlowDesk emite
              <Code>project.unblocked</Code> e a próxima consulta de entitlement já volta com
              <Code>has_access: true</Code>. Nenhuma ação manual é necessária.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
