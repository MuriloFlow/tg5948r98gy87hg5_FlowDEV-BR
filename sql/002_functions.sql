-- ============================================================================
-- FlowDesk — 002_functions.sql
-- Regras de negócio: totais, inadimplência, bloqueio automático, recorrência,
-- emissão de eventos e views analíticas.
-- Execute DEPOIS de 001_schema.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- emit_event: registra um evento que será entregue aos webhooks do projeto
-- ----------------------------------------------------------------------------
create or replace function emit_event(
  p_type          text,
  p_project_id    uuid,
  p_resource_type text,
  p_resource_id   uuid,
  p_payload       jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_event_id uuid;
  v_customer uuid;
begin
  select customer_id into v_customer from projects where id = p_project_id;

  insert into events (type, project_id, customer_id, resource_type, resource_id, payload)
  values (p_type, p_project_id, v_customer, p_resource_type, p_resource_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- log_activity: timeline unificada
-- ----------------------------------------------------------------------------
create or replace function log_activity(
  p_entity_type text,
  p_entity_id   uuid,
  p_project_id  uuid,
  p_kind        text,
  p_title       text,
  p_description text default null,
  p_icon        text default null,
  p_actor_type  actor_type default 'SYSTEM',
  p_actor_label text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into activity_log (
    entity_type, entity_id, project_id, kind, title, description,
    icon, actor_type, actor_label, metadata
  )
  values (
    p_entity_type, p_entity_id, p_project_id, p_kind, p_title, p_description,
    p_icon, p_actor_type, p_actor_label, coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Totais da fatura a partir dos itens
-- ----------------------------------------------------------------------------
create or replace function recalc_invoice_from_items()
returns trigger
language plpgsql
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_subtotal numeric(14,2);
begin
  select coalesce(sum(quantity * unit_amount), 0)
    into v_subtotal
    from invoice_items
   where invoice_id = v_invoice;

  update invoices
     set subtotal = v_subtotal
   where id = v_invoice;

  return null;
end;
$$;

drop trigger if exists trg_invoice_items_total on invoice_items;
create trigger trg_invoice_items_total
after insert or update or delete on invoice_items
for each row execute function recalc_invoice_from_items();

create or replace function invoice_item_total()
returns trigger
language plpgsql
as $$
begin
  new.total := round(new.quantity * new.unit_amount, 2);
  return new;
end;
$$;

drop trigger if exists trg_invoice_item_total on invoice_items;
create trigger trg_invoice_item_total
before insert or update on invoice_items
for each row execute function invoice_item_total();

-- ----------------------------------------------------------------------------
-- Normalização da fatura antes de gravar:
--  - total = subtotal - desconto + multa + juros
--  - blocks_at = due_date + grace_days (do projeto)
--  - transições automáticas de status
-- ----------------------------------------------------------------------------
create or replace function invoice_before_write()
returns trigger
language plpgsql
as $$
declare
  v_grace smallint;
begin
  new.total := greatest(
    round(coalesce(new.subtotal,0) - coalesce(new.discount_amount,0)
          + coalesce(new.late_fee_amount,0) + coalesce(new.interest_amount,0), 2),
    0
  );

  select coalesce(p.grace_days, 0) into v_grace
    from projects p where p.id = new.project_id;

  new.blocks_at := new.due_date + coalesce(v_grace, 0);

  -- quitação
  if new.paid_amount >= new.total and new.total > 0
     and new.status not in ('CANCELED','REFUNDED') then
    new.status := 'PAID';
    if new.paid_at is null then new.paid_at := now(); end if;
  elsif new.paid_amount > 0 and new.paid_amount < new.total
        and new.status not in ('CANCELED','REFUNDED','EXPIRED') then
    new.status := 'PARTIALLY_PAID';
  end if;

  -- vencida
  if new.status in ('OPEN','PENDING') and new.due_date < current_date then
    new.status := 'OVERDUE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_before_write on invoices;
create trigger trg_invoice_before_write
before insert or update on invoices
for each row execute function invoice_before_write();

-- ----------------------------------------------------------------------------
-- refresh_project_access:
--   Decide se o projeto deve ficar ACTIVE ou BLOCKED_PAYMENT.
--   Só age automaticamente quando block_mode = 'AUTO'.
--   Retorna o status final.
-- ----------------------------------------------------------------------------
create or replace function refresh_project_access(p_project_id uuid)
returns project_status
language plpgsql
as $$
declare
  v_project      projects%rowtype;
  v_overdue      integer;
  v_new_status   project_status;
  v_blocking_inv uuid;
begin
  select * into v_project from projects where id = p_project_id;
  if not found then
    return null;
  end if;

  -- Estados terminais/manuais não são tocados pela automação
  if v_project.status in ('SUSPENDED','ARCHIVED') then
    return v_project.status;
  end if;

  select count(*), (min(i.id::text))::uuid
    into v_overdue, v_blocking_inv
    from invoices i
   where i.project_id = p_project_id
     and i.is_mandatory = true
     and i.status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID','EXPIRED')
     and i.blocks_at < current_date;

  if v_project.block_mode = 'AUTO' and v_overdue > 0 then
    v_new_status := 'BLOCKED_PAYMENT';
  elsif v_overdue = 0 then
    -- libera automaticamente inclusive projetos bloqueados manualmente por pagamento
    v_new_status := case
      when v_project.trial_ends_at is not null and v_project.trial_ends_at > now() then 'TRIAL'
      else 'ACTIVE'
    end;
  else
    v_new_status := v_project.status;
  end if;

  if v_new_status is distinct from v_project.status then
    update projects
       set status         = v_new_status,
           blocked_at     = case when v_new_status = 'BLOCKED_PAYMENT' then now() else null end,
           blocked_reason = case when v_new_status = 'BLOCKED_PAYMENT'
                                 then 'Cobrança obrigatória vencida além do período de carência'
                                 else null end,
           unblocked_at   = case when v_new_status <> 'BLOCKED_PAYMENT' then now() else unblocked_at end
     where id = p_project_id;

    if v_new_status = 'BLOCKED_PAYMENT' then
      perform emit_event('project.blocked', p_project_id, 'project', p_project_id,
        jsonb_build_object(
          'project_id', p_project_id,
          'reason', 'payment_overdue',
          'blocking_invoice_id', v_blocking_inv,
          'automatic', true
        ));
      perform log_activity('project', p_project_id, p_project_id, 'status_changed',
        'Projeto bloqueado automaticamente',
        'Cobrança obrigatória vencida além da carência.', 'lock', 'SYSTEM', 'Automação');

      insert into notifications (severity, category, title, body, entity_type, entity_id, action_url)
      values ('CRITICAL', 'billing',
              'Projeto bloqueado: ' || v_project.name,
              'Bloqueio automático por inadimplência.',
              'project', p_project_id, '/projetos/' || p_project_id);
    else
      perform emit_event('project.unblocked', p_project_id, 'project', p_project_id,
        jsonb_build_object('project_id', p_project_id, 'status', v_new_status, 'automatic', true));
      perform log_activity('project', p_project_id, p_project_id, 'status_changed',
        'Projeto liberado', 'Todas as cobranças obrigatórias estão em dia.', 'unlock', 'SYSTEM', 'Automação');

      insert into notifications (severity, category, title, body, entity_type, entity_id, action_url)
      values ('SUCCESS', 'billing',
              'Projeto liberado: ' || v_project.name,
              'Pagamento confirmado, acesso restabelecido automaticamente.',
              'project', p_project_id, '/projetos/' || p_project_id);
    end if;
  end if;

  return v_new_status;
end;
$$;

-- ----------------------------------------------------------------------------
-- Reavalia o acesso do projeto sempre que uma fatura muda de status
-- ----------------------------------------------------------------------------
create or replace function invoice_after_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status
     or new.due_date is distinct from old.due_date
     or new.is_mandatory is distinct from old.is_mandatory then
    perform refresh_project_access(new.project_id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform log_activity('invoice', new.id, new.project_id, 'status_changed',
      'Cobrança ' || new.code || ': ' || old.status::text || ' → ' || new.status::text,
      new.description, 'receipt', 'SYSTEM', null);

    if new.status = 'PAID' then
      perform emit_event('payment.paid', new.project_id, 'invoice', new.id,
        jsonb_build_object('invoice_id', new.id, 'code', new.code,
                           'total', new.total, 'paid_at', new.paid_at));
    elsif new.status = 'OVERDUE' then
      perform emit_event('payment.overdue', new.project_id, 'invoice', new.id,
        jsonb_build_object('invoice_id', new.id, 'code', new.code, 'due_date', new.due_date));
    elsif new.status = 'EXPIRED' then
      perform emit_event('payment.expired', new.project_id, 'invoice', new.id,
        jsonb_build_object('invoice_id', new.id, 'code', new.code));
    elsif new.status = 'CANCELED' then
      perform emit_event('payment.canceled', new.project_id, 'invoice', new.id,
        jsonb_build_object('invoice_id', new.id, 'code', new.code));
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform emit_event('payment.created', new.project_id, 'invoice', new.id,
      jsonb_build_object('invoice_id', new.id, 'code', new.code,
                         'total', new.total, 'due_date', new.due_date));
    perform log_activity('invoice', new.id, new.project_id, 'created',
      'Cobrança ' || new.code || ' criada', new.description, 'plus', new.created_via, null);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_invoice_after_write on invoices;
create trigger trg_invoice_after_write
after insert or update on invoices
for each row execute function invoice_after_write();

-- ----------------------------------------------------------------------------
-- Pagamento aprovado → soma na fatura → dispara liberação do projeto
-- ----------------------------------------------------------------------------
create or replace function payment_after_write()
returns trigger
language plpgsql
as $$
declare
  v_paid numeric(14,2);
begin
  if new.invoice_id is not null then
    select coalesce(sum(amount - refunded_amount), 0)
      into v_paid
      from payments
     where invoice_id = new.invoice_id
       and status in ('APPROVED','AUTHORIZED');

    update invoices
       set paid_amount = v_paid,
           status = case
                      when v_paid <= 0 and status in ('PAID','PARTIALLY_PAID') then 'OPEN'
                      else status
                    end
     where id = new.invoice_id;
  end if;

  if tg_op = 'INSERT' then
    perform log_activity('payment', new.id, new.project_id, 'payment',
      'Pagamento ' || new.method::text || ' iniciado',
      'Valor: R$ ' || to_char(new.amount, 'FM999G999G990D00'), 'credit-card', 'SYSTEM', new.provider);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform log_activity('payment', new.id, new.project_id, 'payment',
      'Pagamento ' || old.status::text || ' → ' || new.status::text, new.provider_status_detail,
      'credit-card', 'WEBHOOK', new.provider);

    if new.status = 'APPROVED' then
      perform emit_event('payment.succeeded', new.project_id, 'payment', new.id,
        jsonb_build_object('payment_id', new.id, 'invoice_id', new.invoice_id,
                           'amount', new.amount, 'method', new.method));
    elsif new.status in ('REJECTED','CANCELLED') then
      perform emit_event('payment.failed', new.project_id, 'payment', new.id,
        jsonb_build_object('payment_id', new.id, 'invoice_id', new.invoice_id,
                           'reason', new.provider_status_detail));
    elsif new.status = 'REFUNDED' then
      perform emit_event('payment.refunded', new.project_id, 'payment', new.id,
        jsonb_build_object('payment_id', new.id, 'invoice_id', new.invoice_id,
                           'amount', new.refunded_amount));
    elsif new.status in ('PENDING','IN_PROCESS') then
      perform emit_event('payment.pending', new.project_id, 'payment', new.id,
        jsonb_build_object('payment_id', new.id, 'invoice_id', new.invoice_id));
    end if;
  end if;

  perform refresh_project_access(new.project_id);
  return null;
end;
$$;

drop trigger if exists trg_payment_after_write on payments;
create trigger trg_payment_after_write
after insert or update on payments
for each row execute function payment_after_write();

-- ----------------------------------------------------------------------------
-- Rotina diária: marca vencidas, expira cobranças e reavalia todos os projetos
-- ----------------------------------------------------------------------------
create or replace function run_daily_billing_maintenance()
returns table (
  overdue_marked  integer,
  expired_marked  integer,
  links_expired   integer,
  projects_checked integer
)
language plpgsql
as $$
declare
  v_overdue  integer := 0;
  v_expired  integer := 0;
  v_links    integer := 0;
  v_projects integer := 0;
  r record;
begin
  with upd as (
    update invoices
       set status = 'OVERDUE'
     where status in ('OPEN','PENDING')
       and due_date < current_date
    returning 1
  ) select count(*) into v_overdue from upd;

  with upd as (
    update invoices
       set status = 'EXPIRED'
     where status in ('OPEN','PENDING','OVERDUE')
       and expires_at is not null
       and expires_at < now()
    returning 1
  ) select count(*) into v_expired from upd;

  with upd as (
    update payment_links
       set status = 'EXPIRED'
     where status = 'ACTIVE'
       and expires_at is not null
       and expires_at < now()
    returning 1
  ) select count(*) into v_links from upd;

  for r in select id from projects where status not in ('ARCHIVED') loop
    perform refresh_project_access(r.id);
    v_projects := v_projects + 1;
  end loop;

  -- limpeza de infraestrutura
  delete from idempotency_keys where expires_at < now();
  delete from rate_limit_buckets where window_start < now() - interval '1 hour';

  return query select v_overdue, v_expired, v_links, v_projects;
end;
$$;

-- ----------------------------------------------------------------------------
-- Avança a data de cobrança respeitando o dia fixo (todo dia 5, 7, 10...)
-- ----------------------------------------------------------------------------
create or replace function calc_next_billing_date(
  p_from      date,
  p_interval  billing_interval,
  p_count     smallint,
  p_billing_day smallint
)
returns date
language plpgsql
immutable
as $$
declare
  v_next date;
  v_step interval;
begin
  v_step := case p_interval
    when 'WEEKLY'     then make_interval(weeks  => p_count)
    when 'BIWEEKLY'   then make_interval(weeks  => p_count * 2)
    when 'MONTHLY'    then make_interval(months => p_count)
    when 'BIMONTHLY'  then make_interval(months => p_count * 2)
    when 'QUARTERLY'  then make_interval(months => p_count * 3)
    when 'SEMIANNUAL' then make_interval(months => p_count * 6)
    when 'ANNUAL'     then make_interval(years  => p_count)
    else null
  end;

  if v_step is null then
    return null;  -- ONE_TIME
  end if;

  v_next := (p_from + v_step)::date;

  if p_billing_day is not null then
    v_next := (date_trunc('month', v_next) + make_interval(days => p_billing_day - 1))::date;
  end if;

  return v_next;
end;
$$;

-- ----------------------------------------------------------------------------
-- Gera as faturas das assinaturas que estão na janela de emissão
-- ----------------------------------------------------------------------------
create or replace function generate_subscription_invoices()
returns table (created_count integer, subscription_ids uuid[])
language plpgsql
as $$
declare
  s record;
  v_invoice_id uuid;
  v_count integer := 0;
  v_ids uuid[] := '{}';
  v_due date;
  v_ref text;
begin
  for s in
    select * from subscriptions
     where status = 'ACTIVE'
       and auto_charge = true
       and next_billing_date is not null
       and next_billing_date <= current_date + generate_days_before
       and (end_date is null or next_billing_date <= end_date)
       and (max_cycles is null or cycles_billed < max_cycles)
  loop
    v_due := s.next_billing_date;

    -- não duplica fatura do mesmo ciclo
    if exists (
      select 1 from invoices
       where subscription_id = s.id and due_date = v_due
         and status <> 'CANCELED'
    ) then
      update subscriptions
         set next_billing_date = calc_next_billing_date(v_due, s.interval, s.interval_count, s.billing_day)
       where id = s.id;
      continue;
    end if;

    v_ref := s.name || ' — ' || to_char(v_due, 'TMMonth/YYYY');

    insert into invoices (
      project_id, customer_id, subscription_id, description, reference,
      period_start, period_end, subtotal, total, currency, status, due_date,
      is_mandatory, payment_methods, created_via,
      expires_at
    ) values (
      s.project_id, s.customer_id, s.id, coalesce(nullif(s.description, ''), s.name), v_ref,
      v_due, calc_next_billing_date(v_due, s.interval, s.interval_count, s.billing_day),
      s.amount, s.amount, s.currency, 'OPEN', v_due,
      s.is_mandatory, s.payment_methods, 'SYSTEM',
      (v_due + (s.grace_days + 30))::timestamptz
    )
    returning id into v_invoice_id;

    update subscriptions
       set next_billing_date = calc_next_billing_date(v_due, s.interval, s.interval_count, s.billing_day),
           last_billed_at = now(),
           cycles_billed = cycles_billed + 1
     where id = s.id;

    v_count := v_count + 1;
    v_ids := array_append(v_ids, s.id);
  end loop;

  return query select v_count, v_ids;
end;
$$;

-- ----------------------------------------------------------------------------
-- Contabiliza uso de uma chave de API (chamado de forma assíncrona pela API)
-- ----------------------------------------------------------------------------
create or replace function touch_api_key(p_api_key_id uuid, p_ip text default null)
returns void
language plpgsql
as $$
begin
  update api_keys
     set last_used_at = now(),
         last_used_ip = nullif(p_ip, '')::inet,
         usage_count  = usage_count + 1
   where id = p_api_key_id;
exception when others then
  -- IP inválido não pode derrubar a requisição
  update api_keys
     set last_used_at = now(), usage_count = usage_count + 1
   where id = p_api_key_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rate limit atômico por janela deslizante de N segundos
-- Retorna o total de hits na janela atual.
-- ----------------------------------------------------------------------------
create or replace function bump_rate_limit(
  p_bucket text,
  p_window_seconds integer default 60
)
returns integer
language plpgsql
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limit_buckets (bucket_key, window_start, window_seconds, hits)
  values (p_bucket, v_window, p_window_seconds, 1)
  on conflict (bucket_key, window_start)
  do update set hits = rate_limit_buckets.hits + 1, updated_at = now()
  returning hits into v_hits;

  return v_hits;
end;
$$;

-- ============================================================================
-- VIEWS ANALÍTICAS
-- ============================================================================

-- Entitlement consumido pelas aplicações integradas
create or replace view v_project_entitlement as
select
  p.id                                        as project_id,
  p.code                                      as project_code,
  p.name                                      as project_name,
  p.slug,
  p.status,
  p.block_mode,
  p.blocked_at,
  p.blocked_reason,
  p.grace_days,
  p.primary_domain,
  c.id                                        as customer_id,
  c.name                                      as customer_name,
  c.email                                     as customer_email,
  (p.status = 'BLOCKED_PAYMENT')              as is_blocked,
  (p.status in ('ACTIVE','TRIAL'))            as has_access,
  bi.id                                       as blocking_invoice_id,
  bi.code                                     as blocking_invoice_code,
  bi.total                                    as blocking_invoice_total,
  bi.due_date                                 as blocking_invoice_due_date,
  bi.description                              as blocking_invoice_description,
  (select count(*) from invoices i
    where i.project_id = p.id
      and i.status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID'))   as open_invoices,
  (select coalesce(sum(i.total - i.paid_amount), 0) from invoices i
    where i.project_id = p.id
      and i.status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID'))   as open_amount
from projects p
join customers c on c.id = p.customer_id
left join lateral (
  select i.* from invoices i
   where i.project_id = p.id
     and i.is_mandatory
     and i.status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID','EXPIRED')
   order by i.due_date asc
   limit 1
) bi on true;

-- Cobranças com dados de cliente/projeto já resolvidos
create or replace view v_invoices_full as
select
  i.*,
  (i.total - i.paid_amount)                                   as balance_due,
  (current_date - i.due_date)                                 as days_overdue,
  c.name        as customer_name,
  c.email       as customer_email,
  c.document    as customer_document,
  p.name        as project_name,
  p.code        as project_code,
  p.status      as project_status,
  pl.token      as payment_link_token,
  pl.checkout_url
from invoices i
join customers c on c.id = i.customer_id
join projects  p on p.id = i.project_id
left join lateral (
  select * from payment_links l
   where l.invoice_id = i.id and l.status = 'ACTIVE'
   order by l.created_at desc limit 1
) pl on true;

-- Resumo financeiro global (usado nos cards do dashboard)
create or replace view v_financial_summary as
select
  coalesce(sum(total) filter (where status = 'PAID'), 0)                          as total_received,
  coalesce(sum(total - paid_amount) filter (
    where status in ('OPEN','PENDING','PARTIALLY_PAID')), 0)                      as total_to_receive,
  coalesce(sum(total - paid_amount) filter (where status = 'OVERDUE'), 0)         as total_overdue,
  coalesce(sum(total) filter (
    where status = 'PAID' and date_trunc('month', paid_at) = date_trunc('month', now())), 0) as received_this_month,
  coalesce(sum(total - paid_amount) filter (
    where status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID')
      and date_trunc('month', due_date) = date_trunc('month', now())), 0)         as due_this_month,
  count(*) filter (where status = 'OVERDUE')                                      as overdue_count,
  count(*) filter (where status in ('OPEN','PENDING'))                            as open_count,
  count(*) filter (where status = 'PAID')                                         as paid_count
from invoices;

-- Série mensal de recebimentos x previstos (últimos 12 meses)
create or replace view v_monthly_revenue as
with months as (
  select generate_series(
    date_trunc('month', now()) - interval '11 months',
    date_trunc('month', now()),
    interval '1 month'
  )::date as month
)
select
  m.month,
  to_char(m.month, 'Mon/YY') as label,
  (select coalesce(sum(i.total), 0) from invoices i
    where i.status = 'PAID'
      and date_trunc('month', i.paid_at)::date = m.month)             as received,
  (select coalesce(sum(i.total), 0) from invoices i
    where i.status <> 'CANCELED'
      and date_trunc('month', i.due_date)::date = m.month)            as expected,
  (select coalesce(sum(i.total - i.paid_amount), 0) from invoices i
    where i.status = 'OVERDUE'
      and date_trunc('month', i.due_date)::date = m.month)            as overdue
from months m
order by m.month;

-- Ranking de clientes por receita
create or replace view v_customer_revenue as
select
  c.id,
  c.name,
  c.email,
  c.status,
  count(distinct p.id)                                              as projects_count,
  coalesce(sum(i.total) filter (where i.status = 'PAID'), 0)        as total_paid,
  coalesce(sum(i.total - i.paid_amount) filter (
    where i.status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID')), 0) as total_open,
  coalesce(sum(i.total - i.paid_amount) filter (where i.status = 'OVERDUE'), 0) as total_overdue,
  max(i.paid_at)                                                    as last_payment_at
from customers c
left join projects p on p.customer_id = c.id
left join invoices i on i.customer_id = c.id
group by c.id, c.name, c.email, c.status;

-- Saúde das integrações por projeto
create or replace view v_project_health as
select
  p.id,
  p.code,
  p.name,
  p.status,
  p.primary_domain,
  c.name as customer_name,
  (select count(*) from api_keys k where k.project_id = p.id and k.status = 'ACTIVE') as active_keys,
  (select max(k.last_used_at) from api_keys k where k.project_id = p.id)              as last_api_call,
  (select count(*) from api_requests r where r.project_id = p.id
     and r.created_at > now() - interval '24 hours')                                  as requests_24h,
  (select count(*) from api_requests r where r.project_id = p.id
     and r.status_code >= 400 and r.created_at > now() - interval '24 hours')         as errors_24h,
  (select count(*) from webhook_endpoints w where w.project_id = p.id and w.status = 'ACTIVE') as webhooks,
  (select coalesce(sum(i.total - i.paid_amount),0) from invoices i
     where i.project_id = p.id and i.status in ('OPEN','PENDING','OVERDUE','PARTIALLY_PAID')) as open_amount
from projects p
join customers c on c.id = p.customer_id;
