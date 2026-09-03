# FlowDesk

Painel de **Payment API + Billing Management** para gerenciar clientes, projetos e cobranças
recorrentes de trabalhos freelancer — com bloqueio automático das aplicações inadimplentes e
liberação automática assim que o pagamento é confirmado pelo Mercado Pago.

- **Painel PRO** com 28 módulos: clientes, empresas, projetos, cobranças, assinaturas, payment
  links, pagamentos, inadimplência, reembolsos, despesas, fluxo de caixa, cupons, credenciais,
  webhooks, eventos, logs, controle de acesso, relatórios, métricas, equipe, auditoria e mais.
- **API REST v1** autenticada por chave, com escopo por projeto, rate limit, idempotência,
  validação de payload e log de todas as requisições.
- **Webhooks assinados** (HMAC-SHA256) com retry e backoff.
- **Checkout hospedado** com Pix (QR Code na hora), cartão e boleto via Mercado Pago.
- **Entitlement**: cada aplicação integrada pergunta se o cliente está em dia e troca a interface
  pela tela de bloqueio quando não está.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres).

---

## 1. Subir o banco

Crie um projeto no [Supabase](https://supabase.com) e rode os scripts **na ordem**, pelo SQL
Editor:

| Arquivo | Conteúdo |
| --- | --- |
| `sql/001_schema.sql` | Tipos, 29 tabelas, índices, triggers de `updated_at` e RLS |
| `sql/002_functions.sql` | Regras de negócio, bloqueio automático, geração de faturas e views |
| `sql/003_seed.sql` | Configurações padrão, modelos de mensagem e carteira de demonstração |

O `003_seed.sql` é opcional — remova o bloco `CARTEIRA DE DEMONSTRAÇÃO` se quiser começar vazio.

## 2. Configurar o ambiente

```bash
cp .env.example .env.local
```

Preencha as chaves do Supabase, o `FLOWDESK_SESSION_SECRET` e as credenciais do Mercado Pago.
O painel funciona sem o Mercado Pago configurado (só o checkout fica indisponível).

## 3. Rodar localmente

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Na primeira execução a tela de login oferece a **criação do usuário
OWNER** — depois disso o cadastro é fechado e novos acessos saem de `Equipe`.

## 4. Deploy na Vercel

1. Importe o repositório e defina as variáveis do `.env.example` no projeto.
2. Use `NEXT_PUBLIC_APP_URL=https://flowdeskbrasil.vercel.app`.
3. O `vercel.json` já registra o cron de faturamento (9h e 21h UTC) apontando para
   `/api/cron/billing`. Defina o `CRON_SECRET` para protegê-lo.

## 5. Conectar o Mercado Pago

Em **Suas integrações → Webhooks**, aponte para:

```
https://flowdeskbrasil.vercel.app/api/webhooks/mercadopago
```

Marque os eventos **Pagamentos** e **Ordens comerciais**, salve a chave secreta em
`MERCADOPAGO_WEBHOOK_SECRET`.

Fluxo automático: pagamento aprovado → webhook → `payments` atualizado → fatura quitada →
`refresh_project_access()` → evento `project.unblocked` → aplicação liberada.

### Desenvolvimento local

O Mercado Pago recusa `notification_url` que não seja pública em HTTPS, então em
`localhost` o campo simplesmente não é enviado — Pix, cartão e boleto continuam
funcionando. Sem webhook a confirmação vem de duas fontes:

- o checkout consulta `/api/public/pay/{token}/status` a cada 4s e sincroniza com o
  gateway;
- as páginas de retorno (`/pay/{token}/sucesso`, `/pendente`, `/falha`) sincronizam o
  `payment_id` devolvido pelo Mercado Pago.

Para exercitar o webhook de verdade, suba um túnel (`ngrok http 3000`) e aponte
`MERCADOPAGO_NOTIFICATION_URL` para ele:

```
MERCADOPAGO_NOTIFICATION_URL=https://SEU-TUNEL.ngrok-free.app/api/webhooks/mercadopago
```

## 6. Integrar um projeto

1. **Credenciais → Nova chave**: escolha o projeto e o ambiente. A chave secreta aparece uma vez.
2. Na aplicação, consulte `GET /api/v1/entitlement` com `Authorization: Bearer sk_live_…`.
3. Se `has_access` for `false`, renderize a tela de bloqueio com `charge.payment_url`.

A referência completa está em **Documentação** dentro do painel. O projeto
`Mecânica Total Flex` já vem integrado — veja `FLOWDESK.md` naquele repositório.

## 7. Estrutura

```
sql/                     scripts do banco (ordem 001 → 003)
src/app/(panel)/         28 módulos do painel administrativo
src/app/api/v1/          API pública consumida pelos projetos integrados
src/app/api/admin/       endpoints internos do painel (pulse, busca, notificações)
src/app/api/webhooks/    recepção do Mercado Pago
src/app/api/cron/        rotina diária de faturamento
src/app/pay/[token]/     checkout público hospedado
src/lib/                 domínio: auth, billing, api-keys, webhooks, mercadopago
src/server/              Server Actions por módulo
src/components/          design system (ui/) e componentes do painel (panel/)
```

## 8. Segurança

- Senhas com scrypt e salt por usuário; sessões com token opaco (hash SHA-256 no banco).
- RLS ativo em todas as tabelas, negando anon/authenticated — o acesso passa pelo service role.
- Chaves de API guardadas como hash; o valor em claro só existe na criação.
- Idempotência por chave em todos os `POST` que movimentam dinheiro.
- Rate limit por chave em janela deslizante, com `Retry-After` na resposta.
- Auditoria de toda ação administrativa, com diff do antes/depois.
