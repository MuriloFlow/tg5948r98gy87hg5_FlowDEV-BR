-- ============================================================================
-- FlowDesk — Payment API & Billing Management
-- 001_schema.sql — Tipos, tabelas, índices e constraints
-- Alvo: PostgreSQL 15+ / Supabase
-- Execute este arquivo INTEIRO no SQL Editor do Supabase (é idempotente).
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ============================================================================
-- 1. TIPOS ENUMERADOS
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'customer_type') then
    create type customer_type as enum ('PF', 'PJ');
  end if;

  if not exists (select 1 from pg_type where typname = 'entity_status') then
    create type entity_status as enum ('ACTIVE', 'INACTIVE', 'ARCHIVED');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type project_status as enum (
      'TRIAL',            -- período de avaliação
      'ACTIVE',           -- liberado
      'BLOCKED_PAYMENT',  -- bloqueado por inadimplência
      'SUSPENDED',        -- suspenso manualmente (não financeiro)
      'ARCHIVED'          -- encerrado
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'block_mode') then
    create type block_mode as enum ('AUTO', 'MANUAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'api_environment') then
    create type api_environment as enum ('TEST', 'LIVE');
  end if;

  if not exists (select 1 from pg_type where typname = 'api_key_status') then
    create type api_key_status as enum ('ACTIVE', 'REVOKED', 'EXPIRED');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type invoice_status as enum (
      'DRAFT',            -- rascunho, não enviada
      'OPEN',             -- emitida, aguardando início de pagamento
      'PENDING',          -- pagamento iniciado (pix gerado / cartão em análise)
      'PAID',             -- quitada
      'PARTIALLY_PAID',   -- pagamento parcial
      'OVERDUE',          -- vencida
      'CANCELED',         -- cancelada
      'REFUNDED',         -- estornada
      'EXPIRED'           -- expirou sem pagamento (cobrança obrigatória)
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'PENDING', 'IN_PROCESS', 'AUTHORIZED', 'APPROVED', 'IN_MEDIATION',
      'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum (
      'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO', 'ACCOUNT_MONEY',
      'BANK_TRANSFER', 'CASH', 'MANUAL', 'OTHER'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'billing_interval') then
    create type billing_interval as enum (
      'ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY',
      'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum (
      'ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCELED', 'COMPLETED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_link_status') then
    create type payment_link_status as enum ('ACTIVE', 'PAID', 'EXPIRED', 'DISABLED');
  end if;

  if not exists (select 1 from pg_type where typname = 'webhook_status') then
    create type webhook_status as enum ('ACTIVE', 'DISABLED');
  end if;

  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type delivery_status as enum ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING', 'DROPPED');
  end if;

  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type admin_role as enum ('OWNER', 'ADMIN', 'FINANCE', 'SUPPORT', 'READONLY');
  end if;

  if not exists (select 1 from pg_type where typname = 'actor_type') then
    create type actor_type as enum ('ADMIN', 'API', 'SYSTEM', 'WEBHOOK', 'PUBLIC');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_severity') then
    create type notification_severity as enum ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'discount_type') then
    create type discount_type as enum ('PERCENT', 'FIXED');
  end if;
end
$$;

-- ============================================================================
-- 2. UTILITÁRIOS
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Gera código sequencial legível por ano: INV-2026-000123
create sequence if not exists invoice_code_seq start 1;
create sequence if not exists customer_code_seq start 1;
create sequence if not exists project_code_seq start 1;

-- ============================================================================
-- 3. USUÁRIOS DO PAINEL (equipe interna)
-- ============================================================================

create table if not exists admin_users (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  email           text        not null,
  password_hash   text        not null,
  role            admin_role  not null default 'ADMIN',
  status          entity_status not null default 'ACTIVE',
  avatar_url      text,
  phone           text,
  timezone        text        not null default 'America/Sao_Paulo',
  locale          text        not null default 'pt-BR',
  two_factor_secret text,
  two_factor_enabled boolean  not null default false,
  must_change_password boolean not null default false,
  failed_attempts smallint    not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  last_login_ip   inet,
  preferences     jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint admin_users_email_key unique (email)
);

create table if not exists admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references admin_users(id) on delete cascade,
  token_hash    text not null,
  ip            inet,
  user_agent    text,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint admin_sessions_token_hash_key unique (token_hash)
);

create index if not exists admin_sessions_user_idx on admin_sessions(user_id);
create index if not exists admin_sessions_expires_idx on admin_sessions(expires_at);

-- ============================================================================
-- 4. CLIENTES E EMPRESAS
-- ============================================================================

create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null default ('CLI-' || lpad(nextval('customer_code_seq')::text, 5, '0')),
  type            customer_type not null default 'PJ',
  name            text not null,                      -- nome do contato principal
  legal_name      text,                               -- razão social
  document        text,                               -- CPF ou CNPJ (somente dígitos)
  email           text not null,
  phone           text,
  whatsapp        text,
  avatar_url      text,
  website         text,

  -- endereço
  zip_code        text,
  street          text,
  number          text,
  complement      text,
  district        text,
  city            text,
  state           char(2),
  country         char(2) not null default 'BR',

  status          entity_status not null default 'ACTIVE',
  tags            text[] not null default '{}',
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,

  -- preferências de cobrança herdadas pelos projetos
  default_due_day smallint check (default_due_day between 1 and 28),
  default_payment_methods payment_method[] not null default '{PIX,CREDIT_CARD,BOLETO}',

  created_by      uuid references admin_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint customers_code_key unique (code),
  constraint customers_document_key unique (document)
);

create index if not exists customers_status_idx on customers(status);
create index if not exists customers_email_idx on customers(lower(email));
create index if not exists customers_search_idx on customers using gin (
  (coalesce(name,'') || ' ' || coalesce(legal_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(document,'')) gin_trgm_ops
);

create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  legal_name    text not null,
  trade_name    text,
  cnpj          text,
  state_registration text,
  municipal_registration text,
  email         text,
  phone         text,
  website       text,
  logo_url      text,

  zip_code      text,
  street        text,
  number        text,
  complement    text,
  district      text,
  city          text,
  state         char(2),
  country       char(2) not null default 'BR',

  status        entity_status not null default 'ACTIVE',
  notes         text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists companies_customer_idx on companies(customer_id);
create index if not exists companies_cnpj_idx on companies(cnpj);

create table if not exists customer_contacts (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  name          text not null,
  role          text,
  email         text,
  phone         text,
  is_primary    boolean not null default false,
  receives_billing boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists customer_contacts_customer_idx on customer_contacts(customer_id);

-- ============================================================================
-- 5. PROJETOS / APLICAÇÕES INTEGRADAS
-- ============================================================================

create table if not exists projects (
  id                uuid primary key default gen_random_uuid(),
  code              text not null default ('PRJ-' || lpad(nextval('project_code_seq')::text, 5, '0')),
  customer_id       uuid not null references customers(id) on delete restrict,
  company_id        uuid references companies(id) on delete set null,

  name              text not null,
  slug              text not null,
  description       text,
  logo_url          text,
  color             text not null default '#635BFF',

  -- aplicação vinculada
  primary_domain    text,
  domains           text[] not null default '{}',
  environment       api_environment not null default 'LIVE',
  tech_stack        text[] not null default '{}',
  repository_url    text,

  -- estado de acesso (entitlement)
  status            project_status not null default 'ACTIVE',
  block_mode        block_mode not null default 'AUTO',
  grace_days        smallint not null default 3 check (grace_days >= 0 and grace_days <= 90),
  blocked_at        timestamptz,
  blocked_reason    text,
  blocked_by        uuid references admin_users(id) on delete set null,
  unblocked_at      timestamptz,
  trial_ends_at     timestamptz,

  -- financeiro base
  contract_value    numeric(14,2) not null default 0,
  monthly_amount    numeric(14,2) not null default 0,
  currency          char(3) not null default 'BRL',
  started_at        date,
  ends_at           date,

  tags              text[] not null default '{}',
  notes             text,
  metadata          jsonb not null default '{}'::jsonb,

  created_by        uuid references admin_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint projects_code_key unique (code),
  constraint projects_slug_key unique (slug)
);

create index if not exists projects_customer_idx on projects(customer_id);
create index if not exists projects_status_idx on projects(status);
create index if not exists projects_domain_idx on projects(primary_domain);

-- ============================================================================
-- 6. CREDENCIAIS DE API POR PROJETO
-- ============================================================================

create table if not exists api_keys (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null default 'Chave padrão',
  environment     api_environment not null default 'LIVE',

  -- identificador público (pode aparecer em logs): fd_live_pk_xxxxx
  key_id          text not null,
  -- hash SHA-256 do secret; o secret em claro só é exibido uma vez na criação
  secret_hash     text not null,
  secret_prefix   text not null,      -- ex.: fd_live_sk_9f3a
  secret_last4    text not null,

  scopes          text[] not null default '{charges:read,charges:write,links:write,entitlement:read,payments:read}',
  allowed_ips     inet[] not null default '{}',
  allowed_origins text[] not null default '{}',
  rate_limit_per_minute integer not null default 120 check (rate_limit_per_minute > 0),

  status          api_key_status not null default 'ACTIVE',
  last_used_at    timestamptz,
  last_used_ip    inet,
  usage_count     bigint not null default 0,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid references admin_users(id) on delete set null,

  created_by      uuid references admin_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint api_keys_key_id_key unique (key_id),
  constraint api_keys_secret_hash_key unique (secret_hash)
);

create index if not exists api_keys_project_idx on api_keys(project_id);
create index if not exists api_keys_status_idx on api_keys(status);

-- ============================================================================
-- 7. ASSINATURAS / PLANOS DE COBRANÇA RECORRENTE
-- ============================================================================

create table if not exists subscriptions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete restrict,

  name              text not null,
  description       text,
  amount            numeric(14,2) not null check (amount >= 0),
  currency          char(3) not null default 'BRL',

  interval          billing_interval not null default 'MONTHLY',
  interval_count    smallint not null default 1 check (interval_count > 0),
  -- dia fixo de cobrança (5, 7, 10...). Se null, usa o dia de start_date.
  billing_day       smallint check (billing_day between 1 and 28),
  -- quantos dias antes do vencimento a fatura é gerada/enviada
  generate_days_before smallint not null default 7 check (generate_days_before between 0 and 60),

  start_date        date not null default current_date,
  end_date          date,
  next_billing_date date,
  last_billed_at    timestamptz,
  cycles_billed     integer not null default 0,
  max_cycles        integer,

  auto_charge       boolean not null default true,   -- gera fatura automaticamente
  is_mandatory      boolean not null default true,   -- inadimplência bloqueia o projeto
  grace_days        smallint not null default 3,
  late_fee_percent  numeric(6,3) not null default 2.000,   -- multa
  interest_percent_month numeric(6,3) not null default 1.000, -- juros a.m.
  payment_methods   payment_method[] not null default '{PIX,CREDIT_CARD,BOLETO}',

  status            subscription_status not null default 'ACTIVE',
  canceled_at       timestamptz,
  cancel_reason     text,

  metadata          jsonb not null default '{}'::jsonb,
  created_by        uuid references admin_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists subscriptions_project_idx on subscriptions(project_id);
create index if not exists subscriptions_next_billing_idx on subscriptions(next_billing_date) where status = 'ACTIVE';

-- ============================================================================
-- 8. COBRANÇAS (INVOICES)
-- ============================================================================

create table if not exists invoices (
  id                uuid primary key default gen_random_uuid(),
  code              text not null default ('INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('invoice_code_seq')::text, 6, '0')),

  project_id        uuid not null references projects(id) on delete restrict,
  customer_id       uuid not null references customers(id) on delete restrict,
  subscription_id   uuid references subscriptions(id) on delete set null,

  description       text not null,
  reference         text,                     -- ex.: "Mensalidade Setembro/2026"
  period_start      date,
  period_end        date,

  subtotal          numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount   numeric(14,2) not null default 0 check (discount_amount >= 0),
  late_fee_amount   numeric(14,2) not null default 0 check (late_fee_amount >= 0),
  interest_amount   numeric(14,2) not null default 0 check (interest_amount >= 0),
  total             numeric(14,2) not null default 0 check (total >= 0),
  paid_amount       numeric(14,2) not null default 0 check (paid_amount >= 0),
  currency          char(3) not null default 'BRL',

  status            invoice_status not null default 'OPEN',
  due_date          date not null,
  issued_at         timestamptz not null default now(),
  paid_at           timestamptz,
  canceled_at       timestamptz,
  cancel_reason     text,
  expires_at        timestamptz,              -- prazo máximo antes de EXPIRED

  -- controla se o não pagamento desta cobrança bloqueia o projeto
  is_mandatory      boolean not null default true,
  blocks_at         date,                     -- due_date + grace_days (calculado por trigger)

  payment_methods   payment_method[] not null default '{PIX,CREDIT_CARD,BOLETO}',
  allow_installments boolean not null default true,
  max_installments  smallint not null default 12 check (max_installments between 1 and 24),

  notes             text,
  internal_notes    text,
  metadata          jsonb not null default '{}'::jsonb,

  reminder_count    smallint not null default 0,
  last_reminder_at  timestamptz,

  idempotency_key   text,
  created_via       actor_type not null default 'ADMIN',
  created_by        uuid references admin_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_code_key unique (code)
);

create index if not exists invoices_project_idx on invoices(project_id);
create index if not exists invoices_customer_idx on invoices(customer_id);
create index if not exists invoices_status_idx on invoices(status);
create index if not exists invoices_due_date_idx on invoices(due_date);
create index if not exists invoices_open_idx on invoices(project_id, due_date)
  where status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID');

create table if not exists invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  description   text not null,
  quantity      numeric(12,3) not null default 1 check (quantity > 0),
  unit_amount   numeric(14,2) not null check (unit_amount >= 0),
  total         numeric(14,2) not null default 0,
  position      smallint not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id);

-- ============================================================================
-- 9. PAYMENT LINKS
-- ============================================================================

create table if not exists payment_links (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid references invoices(id) on delete cascade,
  project_id        uuid not null references projects(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete cascade,

  token             text not null,          -- slug público usado em /pay/{token}
  short_code        text,
  title             text not null,
  description       text,
  amount            numeric(14,2) not null check (amount >= 0),
  currency          char(3) not null default 'BRL',

  -- referência no gateway
  provider          text not null default 'mercadopago',
  provider_preference_id text,
  checkout_url      text,

  status            payment_link_status not null default 'ACTIVE',
  expires_at        timestamptz,
  max_uses          integer not null default 1 check (max_uses > 0),
  uses              integer not null default 0,
  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        integer not null default 0,
  paid_at           timestamptz,

  payment_methods   payment_method[] not null default '{PIX,CREDIT_CARD,BOLETO}',
  max_installments  smallint not null default 12,
  success_url       text,
  failure_url       text,
  pending_url       text,

  metadata          jsonb not null default '{}'::jsonb,
  created_via       actor_type not null default 'ADMIN',
  created_by        uuid references admin_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint payment_links_token_key unique (token)
);

create index if not exists payment_links_invoice_idx on payment_links(invoice_id);
create index if not exists payment_links_project_idx on payment_links(project_id);
create index if not exists payment_links_status_idx on payment_links(status);

-- ============================================================================
-- 10. PAGAMENTOS E ESTORNOS
-- ============================================================================

create table if not exists payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid references invoices(id) on delete set null,
  payment_link_id     uuid references payment_links(id) on delete set null,
  project_id          uuid not null references projects(id) on delete restrict,
  customer_id         uuid not null references customers(id) on delete restrict,

  provider            text not null default 'mercadopago',
  provider_payment_id text,
  provider_order_id   text,
  provider_status     text,
  provider_status_detail text,

  method              payment_method not null default 'PIX',
  status              payment_status not null default 'PENDING',

  amount              numeric(14,2) not null check (amount >= 0),
  net_amount          numeric(14,2),
  fee_amount          numeric(14,2) not null default 0,
  refunded_amount     numeric(14,2) not null default 0,
  currency            char(3) not null default 'BRL',
  installments        smallint not null default 1,

  payer_name          text,
  payer_email         text,
  payer_document      text,

  -- dados específicos de PIX
  pix_qr_code         text,
  pix_qr_code_base64  text,
  pix_expires_at      timestamptz,
  -- dados de boleto
  boleto_url          text,
  boleto_barcode      text,

  card_brand          text,
  card_last4          text,

  approved_at         timestamptz,
  rejected_at         timestamptz,
  refunded_at         timestamptz,

  ip                  inet,
  user_agent          text,
  raw_payload         jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payments_provider_unique unique (provider, provider_payment_id)
);

create index if not exists payments_invoice_idx on payments(invoice_id);
create index if not exists payments_project_idx on payments(project_id);
create index if not exists payments_status_idx on payments(status);
create index if not exists payments_created_idx on payments(created_at desc);

create table if not exists refunds (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references payments(id) on delete cascade,
  invoice_id          uuid references invoices(id) on delete set null,
  amount              numeric(14,2) not null check (amount > 0),
  reason              text,
  provider_refund_id  text,
  status              text not null default 'PENDING',
  raw_payload         jsonb not null default '{}'::jsonb,
  created_by          uuid references admin_users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists refunds_payment_idx on refunds(payment_id);

-- ============================================================================
-- 11. EVENTOS E WEBHOOKS
-- ============================================================================

create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,                   -- payment.paid, project.blocked, ...
  project_id    uuid references projects(id) on delete cascade,
  customer_id   uuid references customers(id) on delete set null,
  resource_type text,
  resource_id   uuid,
  payload       jsonb not null default '{}'::jsonb,
  api_version   text not null default '2026-01-01',
  delivered     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists events_project_idx on events(project_id);
create index if not exists events_type_idx on events(type);
create index if not exists events_created_idx on events(created_at desc);
create index if not exists events_pending_idx on events(delivered, created_at) where delivered = false;

create table if not exists webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  url             text not null,
  description     text,
  secret          text not null,                 -- usado no HMAC SHA-256
  events          text[] not null default '{payment.created,payment.pending,payment.paid,payment.failed,payment.expired,project.blocked,project.unblocked}',
  status          webhook_status not null default 'ACTIVE',
  api_version     text not null default '2026-01-01',

  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures smallint not null default 0,
  total_deliveries bigint not null default 0,

  created_by      uuid references admin_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists webhook_endpoints_project_idx on webhook_endpoints(project_id);

create table if not exists webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references webhook_endpoints(id) on delete cascade,
  event_id        uuid not null references events(id) on delete cascade,
  event_type      text not null,
  attempt         smallint not null default 1,
  status          delivery_status not null default 'PENDING',

  request_url     text not null,
  request_body    text,
  request_headers jsonb not null default '{}'::jsonb,
  response_status smallint,
  response_body   text,
  error_message   text,
  duration_ms     integer,

  next_retry_at   timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists webhook_deliveries_endpoint_idx on webhook_deliveries(endpoint_id);
create index if not exists webhook_deliveries_event_idx on webhook_deliveries(event_id);
create index if not exists webhook_deliveries_retry_idx on webhook_deliveries(next_retry_at)
  where status in ('FAILED','RETRYING');

-- Webhooks recebidos do gateway (Mercado Pago) — para auditoria e reprocessamento
create table if not exists gateway_webhooks (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'mercadopago',
  event_type    text,
  external_id   text,
  signature     text,
  signature_valid boolean,
  headers       jsonb not null default '{}'::jsonb,
  body          jsonb not null default '{}'::jsonb,
  processed     boolean not null default false,
  processed_at  timestamptz,
  process_error text,
  created_at    timestamptz not null default now()
);

create index if not exists gateway_webhooks_external_idx on gateway_webhooks(provider, external_id);
create index if not exists gateway_webhooks_processed_idx on gateway_webhooks(processed, created_at);

-- ============================================================================
-- 12. INFRAESTRUTURA DA API (idempotência, rate limit, logs)
-- ============================================================================

create table if not exists idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  key             text not null,
  api_key_id      uuid references api_keys(id) on delete cascade,
  project_id      uuid references projects(id) on delete cascade,
  endpoint        text not null,
  request_hash    text not null,
  response_status smallint,
  response_body   jsonb,
  locked_at       timestamptz,
  completed_at    timestamptz,
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  created_at      timestamptz not null default now(),
  constraint idempotency_keys_scope_key unique (key, project_id, endpoint)
);

create index if not exists idempotency_keys_expires_idx on idempotency_keys(expires_at);

create table if not exists rate_limit_buckets (
  id            uuid primary key default gen_random_uuid(),
  bucket_key    text not null,                 -- api_key_id | ip | endpoint
  window_start  timestamptz not null,
  window_seconds integer not null default 60,
  hits          integer not null default 0,
  updated_at    timestamptz not null default now(),
  constraint rate_limit_buckets_key unique (bucket_key, window_start)
);

create index if not exists rate_limit_window_idx on rate_limit_buckets(window_start);

create table if not exists api_requests (
  id              uuid primary key default gen_random_uuid(),
  request_id      text not null,
  api_key_id      uuid references api_keys(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  method          text not null,
  path            text not null,
  query           text,
  status_code     smallint not null,
  duration_ms     integer not null default 0,
  ip              inet,
  user_agent      text,
  idempotency_key text,
  request_body    jsonb,
  response_summary jsonb,
  error_code      text,
  created_at      timestamptz not null default now()
);

create index if not exists api_requests_project_idx on api_requests(project_id, created_at desc);
create index if not exists api_requests_created_idx on api_requests(created_at desc);
create index if not exists api_requests_status_idx on api_requests(status_code);

-- ============================================================================
-- 13. AUDITORIA, NOTIFICAÇÕES E CONFIGURAÇÕES
-- ============================================================================

create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_type    actor_type not null default 'ADMIN',
  actor_id      uuid,
  actor_label   text,
  action        text not null,                 -- invoice.created, project.blocked...
  entity_type   text not null,
  entity_id     uuid,
  entity_label  text,
  before_data   jsonb,
  after_data    jsonb,
  diff          jsonb,
  ip            inet,
  user_agent    text,
  request_id    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on audit_logs(entity_type, entity_id);
create index if not exists audit_logs_actor_idx on audit_logs(actor_id);
create index if not exists audit_logs_created_idx on audit_logs(created_at desc);

create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references admin_users(id) on delete cascade,  -- null = broadcast
  severity      notification_severity not null default 'INFO',
  category      text not null default 'general',
  title         text not null,
  body          text,
  entity_type   text,
  entity_id     uuid,
  action_url    text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications(user_id, read_at);
create index if not exists notifications_created_idx on notifications(created_at desc);

create table if not exists settings (
  key           text primary key,
  value         jsonb not null default '{}'::jsonb,
  description   text,
  is_secret     boolean not null default false,
  updated_by    uuid references admin_users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create table if not exists message_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  channel       text not null default 'email',   -- email | whatsapp | sms
  name          text not null,
  subject       text,
  body          text not null,
  variables     text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint message_templates_key_channel unique (key, channel)
);

create table if not exists coupons (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  description     text,
  discount_type   discount_type not null default 'PERCENT',
  discount_value  numeric(14,2) not null check (discount_value > 0),
  max_redemptions integer,
  redemptions     integer not null default 0,
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint coupons_code_key unique (code)
);

create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  description   text not null,
  category      text not null default 'infra',
  amount        numeric(14,2) not null check (amount >= 0),
  currency      char(3) not null default 'BRL',
  project_id    uuid references projects(id) on delete set null,
  due_date      date,
  paid_at       timestamptz,
  is_recurring  boolean not null default false,
  interval      billing_interval,
  notes         text,
  created_by    uuid references admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists expenses_due_idx on expenses(due_date);

create table if not exists attachments (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     uuid not null,
  file_name     text not null,
  file_url      text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references admin_users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);

-- Timeline unificada por entidade (aparece no detalhe de cliente/projeto/cobrança)
create table if not exists activity_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     uuid not null,
  project_id    uuid references projects(id) on delete cascade,
  kind          text not null,                -- created | status_changed | payment | note | email
  title         text not null,
  description   text,
  icon          text,
  actor_type    actor_type not null default 'SYSTEM',
  actor_label   text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_entity_idx on activity_log(entity_type, entity_id, created_at desc);
create index if not exists activity_log_project_idx on activity_log(project_id, created_at desc);

-- ============================================================================
-- 14. TRIGGERS DE updated_at
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'admin_users','customers','companies','customer_contacts','projects','api_keys',
    'subscriptions','invoices','payment_links','payments','refunds',
    'webhook_endpoints','message_templates','coupons','expenses'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function set_updated_at()', t);
  end loop;
end
$$;

-- ============================================================================
-- 15. RLS — bloqueia acesso anônimo. Todo acesso é via service role no servidor.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'admin_users','admin_sessions','customers','companies','customer_contacts',
    'projects','api_keys','subscriptions','invoices','invoice_items','payment_links',
    'payments','refunds','events','webhook_endpoints','webhook_deliveries',
    'gateway_webhooks','idempotency_keys','rate_limit_buckets','api_requests',
    'audit_logs','notifications','settings','message_templates','coupons',
    'expenses','attachments','activity_log'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "deny_all_anon" on %I', t);
    execute format(
      'create policy "deny_all_anon" on %I for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end
$$;
