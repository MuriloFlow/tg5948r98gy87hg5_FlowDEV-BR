-- ============================================================================
-- FlowDesk — 003_seed.sql
-- Dados iniciais: templates de mensagem, configurações padrão e (opcional)
-- uma carteira de demonstração para você navegar no painel com conteúdo real.
-- Execute DEPOIS de 001_schema.sql e 002_functions.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Configurações padrão
-- ----------------------------------------------------------------------------
insert into settings (key, value, description) values
  ('company_profile', jsonb_build_object(
      'legal_name', '',
      'trade_name', 'FlowDesk',
      'document', '',
      'email', '',
      'phone', '',
      'city', '',
      'state', '',
      'logo_url', '',
      'statement_descriptor', 'FLOWDESK'
   ), 'Dados do emissor das cobranças'),

  ('billing_defaults', jsonb_build_object(
      'grace_days', 3,
      'due_day', 5,
      'payment_methods', jsonb_build_array('PIX','CREDIT_CARD','BOLETO'),
      'max_installments', 12,
      'late_fee_percent', 2.0,
      'interest_percent_month', 1.0,
      'expire_after_days', 30,
      'generate_days_before', 7
   ), 'Padrões aplicados a novas cobranças e assinaturas'),

  ('notification_rules', jsonb_build_object(
      'notify_on_paid', true,
      'notify_on_overdue', true,
      'notify_on_blocked', true,
      'reminder_days_before', jsonb_build_array(5, 1),
      'reminder_days_after', jsonb_build_array(1, 3, 7, 15)
   ), 'Quando o sistema deve gerar alertas')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Modelos de mensagem
-- ----------------------------------------------------------------------------
insert into message_templates (key, channel, name, subject, body, variables) values
  ('invoice_created', 'email', 'Nova cobrança emitida',
   'Nova cobrança {{codigo}} — {{projeto}}',
   E'Olá, {{cliente}}!\n\nUma nova cobrança foi emitida para o projeto {{projeto}}.\n\nValor: {{valor}}\nVencimento: {{vencimento}}\nDescrição: {{descricao}}\n\nPague com Pix, cartão ou boleto pelo link abaixo:\n{{link_pagamento}}\n\nQualquer dúvida, é só responder este e-mail.',
   array['cliente','projeto','codigo','valor','vencimento','descricao','link_pagamento']),

  ('invoice_reminder', 'email', 'Lembrete de vencimento',
   'Sua cobrança {{codigo}} vence em breve',
   E'Olá, {{cliente}}!\n\nEste é um lembrete de que a cobrança {{codigo}} vence em {{vencimento}}.\n\nValor: {{valor}}\n\nPague agora pelo link:\n{{link_pagamento}}',
   array['cliente','codigo','valor','vencimento','link_pagamento']),

  ('invoice_overdue', 'email', 'Cobrança vencida',
   'Cobrança {{codigo}} em atraso',
   E'Olá, {{cliente}}.\n\nA cobrança {{codigo}} no valor de {{valor}} venceu em {{vencimento}} e ainda consta em aberto.\n\nRegularize pelo link abaixo para evitar a suspensão do acesso ao sistema:\n{{link_pagamento}}',
   array['cliente','codigo','valor','vencimento','link_pagamento']),

  ('project_blocked', 'email', 'Acesso suspenso',
   'Acesso ao {{projeto}} suspenso por falta de pagamento',
   E'Olá, {{cliente}}.\n\nO acesso ao {{projeto}} foi suspenso porque a cobrança {{codigo}} ({{valor}}) segue em aberto desde {{vencimento}}.\n\nAssim que o pagamento for confirmado, o acesso é liberado automaticamente:\n{{link_pagamento}}',
   array['cliente','projeto','codigo','valor','vencimento','link_pagamento']),

  ('payment_confirmed', 'email', 'Pagamento confirmado',
   'Recebemos seu pagamento — {{codigo}}',
   E'Olá, {{cliente}}!\n\nConfirmamos o pagamento de {{valor}} referente à cobrança {{codigo}}.\n\nO acesso ao {{projeto}} já está liberado. Obrigado!',
   array['cliente','projeto','codigo','valor']),

  ('invoice_reminder', 'whatsapp', 'Lembrete via WhatsApp', null,
   E'Oi, {{cliente}}! Passando para lembrar que a cobrança de {{valor}} do {{projeto}} vence em {{vencimento}}. Segue o link para pagar com Pix: {{link_pagamento}}',
   array['cliente','projeto','valor','vencimento','link_pagamento']),

  ('invoice_overdue', 'whatsapp', 'Cobrança vencida via WhatsApp', null,
   E'Oi, {{cliente}}. A cobrança de {{valor}} do {{projeto}} venceu em {{vencimento}}. Para evitar a suspensão do acesso, pague por aqui: {{link_pagamento}}',
   array['cliente','projeto','valor','vencimento','link_pagamento'])
on conflict (key, channel) do nothing;

-- ============================================================================
-- CARTEIRA DE DEMONSTRAÇÃO (opcional)
-- Remova o bloco abaixo se quiser começar com o painel vazio.
-- ============================================================================

do $$
declare
  v_customer uuid;
  v_customer2 uuid;
  v_company uuid;
  v_project uuid;
  v_project2 uuid;
  v_project3 uuid;
  v_sub uuid;
  v_invoice uuid;
begin
  -- não duplica se já rodou antes
  if exists (select 1 from customers where email = 'financeiro@mecanicatotalflex.com.br') then
    raise notice 'Seed de demonstração já aplicado, pulando.';
    return;
  end if;

  -- ---------------------------------------------------------------- clientes
  insert into customers (type, name, legal_name, document, email, phone, whatsapp,
                         city, state, default_due_day, tags, notes)
  values ('PJ', 'Carlos Menezes', 'Auto Mecânica Total Flex LTDA', '19283746000155',
          'financeiro@mecanicatotalflex.com.br', '11 3555-1200', '11 98877-1200',
          'São Paulo', 'SP', 5, array['mensalista','prioritário'],
          'Cliente âncora. Sistema de ordem de serviço em produção.')
  returning id into v_customer;

  insert into customers (type, name, legal_name, document, email, phone,
                         city, state, default_due_day, tags)
  values ('PJ', 'Renata Alves', 'Corpo & Evolução Studio ME', '28374655000122',
          'contato@corpoevolucao.com.br', '11 4002-8922',
          'Campinas', 'SP', 10, array['mensalista'])
  returning id into v_customer2;

  insert into companies (customer_id, legal_name, trade_name, cnpj, email, city, state)
  values (v_customer, 'Auto Mecânica Total Flex LTDA', 'Total Flex', '19283746000155',
          'contato@mecanicatotalflex.com.br', 'São Paulo', 'SP')
  returning id into v_company;

  -- ---------------------------------------------------------------- projetos
  insert into projects (customer_id, company_id, name, slug, description, primary_domain,
                        domains, environment, status, block_mode, grace_days,
                        contract_value, monthly_amount, started_at, color, tech_stack, tags)
  values (v_customer, v_company, 'Total Flex OS', 'total-flex-os',
          'Sistema de ordens de serviço, orçamentos e controle de veículos.',
          'mecanicatotalflex.com.br', array['app.mecanicatotalflex.com.br'],
          'LIVE', 'ACTIVE', 'AUTO', 3, 9800.00, 490.00, current_date - 120,
          '#635BFF', array['Next.js','Supabase','Tailwind'], array['produção'])
  returning id into v_project;

  insert into projects (customer_id, name, slug, description, primary_domain,
                        environment, status, block_mode, grace_days,
                        contract_value, monthly_amount, started_at, color, tech_stack)
  values (v_customer, 'Total Flex — Portal do Cliente', 'total-flex-portal',
          'Portal onde o cliente final acompanha o serviço do veículo.',
          'portal.mecanicatotalflex.com.br',
          'LIVE', 'ACTIVE', 'MANUAL', 5, 4200.00, 190.00, current_date - 45,
          '#00D4B1', array['Next.js','Supabase'])
  returning id into v_project2;

  insert into projects (customer_id, name, slug, description, primary_domain,
                        environment, status, block_mode, grace_days,
                        contract_value, monthly_amount, started_at, color)
  values (v_customer2, 'Corpo & Evolução — Agenda', 'corpo-evolucao-agenda',
          'Agendamento de aulas, planos e cobrança recorrente de alunos.',
          'corpoevolucao.com.br',
          'LIVE', 'ACTIVE', 'AUTO', 3, 6500.00, 320.00, current_date - 200,
          '#F59E0B')
  returning id into v_project3;

  -- ------------------------------------------------------------ assinaturas
  insert into subscriptions (project_id, customer_id, name, description, amount,
                             interval, billing_day, generate_days_before, start_date,
                             next_billing_date, auto_charge, is_mandatory, grace_days)
  values (v_project, v_customer, 'Mensalidade Total Flex OS',
          'Hospedagem, suporte e manutenção evolutiva', 490.00,
          'MONTHLY', 5, 7, current_date - 120,
          (date_trunc('month', now() + interval '1 month') + interval '4 days')::date,
          true, true, 3)
  returning id into v_sub;

  insert into subscriptions (project_id, customer_id, name, description, amount,
                             interval, billing_day, generate_days_before, start_date,
                             next_billing_date, auto_charge, is_mandatory, grace_days)
  values (v_project3, v_customer2, 'Mensalidade Agenda',
          'Plataforma de agendamento e cobrança', 320.00,
          'MONTHLY', 10, 7, current_date - 200,
          (date_trunc('month', now() + interval '1 month') + interval '9 days')::date,
          true, true, 3);

  -- --------------------------------------------------------------- cobranças
  -- histórico pago (últimos 3 meses)
  for i in 1..3 loop
    insert into invoices (project_id, customer_id, subscription_id, description, reference,
                          subtotal, total, status, due_date, paid_at, paid_amount,
                          is_mandatory, created_via)
    values (v_project, v_customer, v_sub, 'Mensalidade Total Flex OS',
            to_char(now() - make_interval(months => i), 'TMMonth/YYYY'),
            490.00, 490.00, 'PAID',
            (date_trunc('month', now() - make_interval(months => i)) + interval '4 days')::date,
            (date_trunc('month', now() - make_interval(months => i)) + interval '4 days')::timestamptz,
            490.00, true, 'SYSTEM');
  end loop;

  for i in 1..2 loop
    insert into invoices (project_id, customer_id, description, reference,
                          subtotal, total, status, due_date, paid_at, paid_amount,
                          is_mandatory, created_via)
    values (v_project3, v_customer2, 'Mensalidade Agenda',
            to_char(now() - make_interval(months => i), 'TMMonth/YYYY'),
            320.00, 320.00, 'PAID',
            (date_trunc('month', now() - make_interval(months => i)) + interval '9 days')::date,
            (date_trunc('month', now() - make_interval(months => i)) + interval '9 days')::timestamptz,
            320.00, true, 'SYSTEM');
  end loop;

  -- cobrança em aberto (vence em breve)
  insert into invoices (project_id, customer_id, subscription_id, description, reference,
                        subtotal, total, status, due_date, is_mandatory, created_via,
                        expires_at)
  values (v_project, v_customer, v_sub, 'Mensalidade Total Flex OS',
          to_char(now(), 'TMMonth/YYYY'), 490.00, 490.00, 'OPEN',
          current_date + 6, true, 'SYSTEM', (current_date + 40)::timestamptz);

  -- cobrança avulsa em aberto
  insert into invoices (project_id, customer_id, description, reference,
                        subtotal, total, status, due_date, is_mandatory, created_via)
  values (v_project2, v_customer, 'Implantação do Portal do Cliente',
          'Parcela 2/3', 1400.00, 1400.00, 'OPEN', current_date + 12, false, 'ADMIN');

  -- cobrança vencida (dispara o bloqueio automático quando passar da carência)
  insert into invoices (project_id, customer_id, description, reference,
                        subtotal, total, status, due_date, is_mandatory, created_via)
  values (v_project3, v_customer2, 'Mensalidade Agenda',
          to_char(now(), 'TMMonth/YYYY'), 320.00, 320.00, 'OVERDUE',
          current_date - 9, true, 'SYSTEM')
  returning id into v_invoice;

  -- ------------------------------------------------------------ notificações
  insert into notifications (severity, category, title, body, entity_type, entity_id, action_url)
  values ('WARNING', 'billing', 'Cobrança vencida há 9 dias',
          'Corpo & Evolução — Agenda: R$ 320,00 em aberto.',
          'invoice', v_invoice, '/inadimplencia'),
         ('INFO', 'system', 'Bem-vindo ao FlowDesk',
          'Crie as credenciais de API do seu projeto para começar a integrar.',
          null, null, '/credenciais');

  raise notice 'Seed de demonstração aplicado com sucesso.';
end
$$;

-- Reavalia o acesso de todos os projetos com base nas cobranças criadas acima.
select run_daily_billing_maintenance();
