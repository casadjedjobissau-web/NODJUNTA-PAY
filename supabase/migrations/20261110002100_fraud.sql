-- Antifraude: regras avaliadas no servidor ANTES de cada movimento de dinheiro.
-- Codigo de erro novo: NJ034 alerta de fraude inexistente.
-- Os valores iniciais sao PROVISORIOS: definir com a conformidade e o banco parceiro.

alter table public.user_pins add column if not exists pin_changed_at timestamptz;

-- Substitui pin_replace: ao TROCAR um PIN existente fica registada a data (a pausa nos levantamentos).
create or replace function public.pin_replace(p_user uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null or p_hash is null or char_length(p_hash) < 20 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.user_pins (user_id, pin_hash)
  values (p_user, p_hash)
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        pin_changed_at = now();
end;
$$;

create table public.fraud_settings (
  key text primary key check (key in (
    'fraud_enabled', 'velocity_window_minutes', 'velocity_max_ops',
    'withdrawal_cooldown_hours', 'large_amount_flag'
  )),
  value bigint not null check (value >= 0 and value <= 1000000000000),
  updated_at timestamptz not null default now()
);

comment on table public.fraud_settings is
  'Limiares do antifraude. 0 desativa a regra (fraud_enabled: 0 desliga tudo). Valores iniciais provisorios.';

create trigger fraud_settings_set_updated_at
  before update on public.fraud_settings
  for each row execute function public.set_updated_at();

insert into public.fraud_settings (key, value)
values
  ('fraud_enabled', 1),
  ('velocity_window_minutes', 10),
  ('velocity_max_ops', 10),
  ('withdrawal_cooldown_hours', 24),
  ('large_amount_flag', 500000)
on conflict (key) do nothing;

alter table public.fraud_settings enable row level security;
revoke all on public.fraud_settings from anon, authenticated;

create table public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references auth.users (id) on delete restrict,
  rule text not null check (rule in ('velocity', 'cooldown', 'large_amount')),
  decision text not null check (decision in ('block', 'flag')),
  operation text not null check (operation in ('transfer', 'merchant_payment', 'withdrawal')),
  amount bigint not null check (amount > 0),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  constraint fraud_alerts_review_check check (
    (status = 'open' and reviewed_by is null and reviewed_at is null)
    or (status = 'reviewed' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index fraud_alerts_status_idx on public.fraud_alerts (status, seq desc);
create index fraud_alerts_dedupe_idx on public.fraud_alerts (user_id, rule, decision, created_at desc);

alter table public.fraud_alerts enable row level security;
revoke all on public.fraud_alerts from anon, authenticated;

create or replace function public.fraud_setting(p_key text, p_default bigint)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select s.value from public.fraud_settings s where s.key = p_key), p_default)
$$;

-- Avalia uma operacao ANTES de ela acontecer. Corre fora da transacao do movimento, por isso os
-- alertas ficam gravados mesmo quando a operacao e bloqueada.
create or replace function public.fraud_check(p_user uuid, p_operation text, p_amount bigint)
returns table (out_decision text, out_rule text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window integer;
  v_max bigint;
  v_cool integer;
  v_large bigint;
  v_count bigint;
  v_decision text := null;
  v_rule text := null;
  v_details jsonb := '{}'::jsonb;
begin
  if p_user is null or p_amount is null or p_amount <= 0
     or p_operation is null or p_operation not in ('transfer', 'merchant_payment', 'withdrawal') then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  if public.fraud_setting('fraud_enabled', 1) = 0 then
    return query select 'allow'::text, null::text;
    return;
  end if;

  v_window := least(greatest(public.fraud_setting('velocity_window_minutes', 10), 1), 1440)::integer;
  v_max := public.fraud_setting('velocity_max_ops', 10);
  v_cool := least(public.fraud_setting('withdrawal_cooldown_hours', 24), 8760)::integer;
  v_large := public.fraud_setting('large_amount_flag', 500000);

  -- 1. Pausa nos levantamentos depois de trocar o PIN ou o numero de telefone.
  if p_operation = 'withdrawal' and v_cool > 0 and (
       exists (
         select 1 from public.phone_change_requests r
          where r.user_id = p_user and r.status = 'approved'
            and r.decided_at > now() - make_interval(hours => v_cool)
       )
       or exists (
         select 1 from public.user_pins u
          where u.user_id = p_user and u.pin_changed_at is not null
            and u.pin_changed_at > now() - make_interval(hours => v_cool)
       )
     ) then
    v_decision := 'block';
    v_rule := 'cooldown';
    v_details := jsonb_build_object('hours', v_cool);
  end if;

  -- 2. Velocidade: demasiadas operacoes em pouco tempo.
  if v_decision is null and v_max > 0 then
    select count(*) into v_count
      from public.transactions t
     where t.initiator_id = p_user
       and t.type in ('transfer', 'merchant_payment', 'withdrawal')
       and t.created_at > now() - make_interval(mins => v_window);
    if v_count >= v_max then
      v_decision := 'block';
      v_rule := 'velocity';
      v_details := jsonb_build_object('count', v_count, 'max', v_max, 'window_minutes', v_window);
    end if;
  end if;

  -- 3. Montante elevado: a operacao passa, mas fica um alerta para a administracao.
  if v_decision is null and v_large > 0 and p_amount >= v_large then
    v_decision := 'flag';
    v_rule := 'large_amount';
    v_details := jsonb_build_object('threshold', v_large);
  end if;

  if v_decision is null then
    return query select 'allow'::text, null::text;
    return;
  end if;

  -- Um alerta novo no maximo de 10 em 10 minutos, por utilizador e regra.
  if not exists (
    select 1 from public.fraud_alerts a
     where a.user_id = p_user and a.rule = v_rule and a.decision = v_decision
       and a.created_at > now() - interval '10 minutes'
  ) then
    insert into public.fraud_alerts (user_id, rule, decision, operation, amount, details)
    values (p_user, v_rule, v_decision, p_operation, p_amount, v_details);
  end if;

  return query select v_decision, v_rule;
end;
$$;

create or replace function public.admin_list_fraud_alerts(p_status text, p_limit integer)
returns table (
  id uuid,
  seq bigint,
  user_id uuid,
  full_name text,
  phone_masked text,
  rule text,
  decision text,
  operation text,
  amount bigint,
  details jsonb,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select a.id, a.seq, a.user_id, p.full_name, public.mask_phone(u.phone), a.rule, a.decision,
         a.operation, a.amount, a.details, a.status, a.reviewed_by, a.reviewed_at, a.review_note,
         a.created_at
    from public.fraud_alerts a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.user_id = a.user_id
   where p_status is null or a.status = p_status
   order by case when a.status = 'open' then 0 else 1 end, a.seq desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.admin_review_fraud_alert(p_admin uuid, p_alert uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.fraud_alerts%rowtype;
  v_note text := trim(coalesce(p_note, ''));
begin
  if p_admin is null or p_alert is null or char_length(v_note) > 300 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_a from public.fraud_alerts where id = p_alert for update;
  if not found then
    raise exception 'alerta inexistente' using errcode = 'NJ034';
  end if;
  if v_a.user_id = p_admin then
    raise exception 'nao pode tratar alertas da propria conta' using errcode = 'NJ017';
  end if;
  if v_a.status = 'reviewed' then
    return 'reviewed';
  end if;

  update public.fraud_alerts
     set status = 'reviewed', reviewed_by = p_admin, reviewed_at = now(),
         review_note = nullif(v_note, '')
   where id = v_a.id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_admin, 'admin', 'ADMIN_FRAUD_REVIEW', 'fraud_alert', v_a.id::text,
          jsonb_build_object('rule', v_a.rule));

  return 'reviewed';
end;
$$;

revoke execute on function public.fraud_setting(text, bigint) from public, anon, authenticated;
revoke execute on function public.fraud_check(uuid, text, bigint) from public, anon, authenticated;
revoke execute on function public.admin_list_fraud_alerts(text, integer) from public, anon, authenticated;
revoke execute on function public.admin_review_fraud_alert(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.fraud_setting(text, bigint) to service_role;
grant execute on function public.fraud_check(uuid, text, bigint) to service_role;
grant execute on function public.admin_list_fraud_alerts(text, integer) to service_role;
grant execute on function public.admin_review_fraud_alert(uuid, uuid, text) to service_role;
