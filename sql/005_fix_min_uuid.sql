-- ============================================================================
-- Hotfix: "function min(uuid) does not exist"
--
-- O Postgres não tem agregado min() para uuid. A chamada quebrava o trigger
-- disparado ao gravar pagamentos, impedindo a confirmação automática.
-- Cole este arquivo inteiro no Supabase → SQL Editor e execute.
-- ============================================================================

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
