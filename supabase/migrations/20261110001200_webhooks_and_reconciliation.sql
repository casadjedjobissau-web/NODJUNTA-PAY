create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null check (char_length(provider) between 1 and 40),
  event_id text not null check (char_length(event_id) between 8 and 128),
  event_type text not null check (char_length(event_type) between 1 and 80),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text check (error is null or char_length(error) <= 200),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint webhook_events_provider_event_uq unique (provider, event_id)
);

create index webhook_events_status_idx on public.webhook_events (status, received_at desc);

alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

create or replace function public.process_webhook_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_provider_ref text,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row_id bigint;
  v_req public.payment_requests%rowtype;
begin
  if p_provider is null or char_length(p_provider) = 0
     or p_event_id is null or char_length(p_event_id) not between 8 and 128
     or p_event_type is null or char_length(p_event_type) = 0
     or p_provider_ref is null or char_length(p_provider_ref) = 0 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.webhook_events (provider, event_id, event_type, provider_ref, payload)
  values (p_provider, p_event_id, p_event_type, p_provider_ref, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    return 'duplicate';
  end if;

  select * into v_req
    from public.payment_requests
   where provider = p_provider and provider_ref = p_provider_ref;

  if not found then
    update public.webhook_events
       set status = 'ignored', error = 'pedido desconhecido', processed_at = now()
     where id = v_row_id;
    return 'ignored';
  end if;

  if split_part(p_event_type, '.', 1) <> v_req.kind::text then
    update public.webhook_events
       set status = 'ignored', error = 'tipo de evento nao corresponde ao pedido', processed_at = now()
     where id = v_row_id;
    return 'ignored';
  end if;

  begin
    if p_event_type like '%.completed' then
      perform public.settle_payment_request(v_req.id, p_provider_ref);
    elsif p_event_type like '%.failed' then
      perform public.fail_payment_request(v_req.id, 'provider_failed');
    else
      update public.webhook_events
         set status = 'ignored', error = 'tipo de evento desconhecido', processed_at = now()
       where id = v_row_id;
      return 'ignored';
    end if;

    update public.webhook_events
       set status = 'processed', processed_at = now()
     where id = v_row_id;

    insert into public.audit_logs (actor_type, action, entity_type, entity_id, metadata)
    values (
      'webhook', 'WEBHOOK_' || upper(replace(p_event_type, '.', '_')),
      'payment_request', v_req.id::text,
      jsonb_build_object('provider', p_provider, 'event_id', p_event_id)
    );

    return 'processed';
  exception when others then
    update public.webhook_events
       set status = 'failed', error = left(sqlerrm, 200), processed_at = now()
     where id = v_row_id;
    return 'failed';
  end;
end;
$$;

create or replace function public.reconcile_report(p_currency text)
returns table (check_name text, expected bigint, actual bigint, ok boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sum bigint;
  v_suspense bigint;
  v_pending bigint;
  v_issues bigint;
begin
  select coalesce(sum(balance), 0) into v_sum
    from public.accounts where currency = p_currency;

  select coalesce(sum(balance), 0) into v_suspense
    from public.accounts where currency = p_currency and type = 'suspense' and owner_id is null;

  select coalesce(sum(amount), 0) into v_pending
    from public.payment_requests
   where currency = p_currency and kind = 'withdrawal' and status = 'pending';

  select count(*) into v_issues from public.ledger_integrity_issues;

  return query select 'soma_de_todos_os_saldos'::text, 0::bigint, v_sum, v_sum = 0;
  return query select 'retencao_igual_a_levantamentos_pendentes'::text, v_pending, v_suspense, v_suspense = v_pending;
  return query select 'integridade_do_livro_razao'::text, 0::bigint, v_issues, v_issues = 0;
end;
$$;

revoke execute on function public.process_webhook_event(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.reconcile_report(text)
  from public, anon, authenticated;

grant execute on function public.process_webhook_event(text, text, text, text, jsonb) to service_role;
grant execute on function public.reconcile_report(text) to service_role;
