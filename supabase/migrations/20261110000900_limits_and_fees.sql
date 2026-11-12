-- Codigos de erro novos: NJ011 limite excedido, NJ012 operacao nao permitida neste nivel de KYC.

create table public.limit_rules (
  kyc_level smallint not null check (kyc_level between 0 and 3),
  operation text not null check (operation in ('transfer', 'merchant_payment', 'withdrawal')),
  period text not null check (period in ('tx', 'day', 'month')),
  max_amount bigint not null check (max_amount > 0),
  primary key (kyc_level, operation, period)
);

comment on table public.limit_rules is
  'VALORES PROVISORIOS (XOF). Definir com o regulador/banco parceiro. Sem regra para um nivel = operacao nao permitida.';

create table public.fee_rules (
  operation text primary key check (operation in ('transfer', 'merchant_payment', 'withdrawal')),
  flat_amount bigint not null default 0 check (flat_amount >= 0),
  bps integer not null default 0 check (bps between 0 and 10000),
  min_fee bigint not null default 0 check (min_fee >= 0),
  max_fee bigint check (max_fee is null or max_fee >= min_fee)
);

comment on table public.fee_rules is
  'Tarifa = flat_amount + arredondamento para cima de (valor * bps / 10000), limitada por min_fee e max_fee. Todas a 0 ate haver decisao comercial.';

insert into public.limit_rules (kyc_level, operation, period, max_amount)
select b.lvl::smallint,
       o.op,
       p.period,
       case p.period when 'tx' then b.tx::bigint when 'day' then b.d::bigint else b.m::bigint end
  from (values
         (0, 25000, 50000, 200000),
         (1, 200000, 500000, 2000000),
         (2, 1000000, 3000000, 10000000),
         (3, 1000000, 3000000, 10000000)
       ) as b(lvl, tx, d, m)
 cross join (values ('transfer'), ('merchant_payment'), ('withdrawal')) as o(op)
 cross join (values ('tx'), ('day'), ('month')) as p(period)
 where not (b.lvl = 0 and o.op = 'withdrawal');

insert into public.fee_rules (operation)
values ('transfer'), ('merchant_payment'), ('withdrawal');

create or replace function public.compute_fee(p_operation text, p_amount bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.fee_rules%rowtype;
  v_fee bigint;
begin
  select * into v_rule from public.fee_rules where operation = p_operation;
  if not found then
    return 0;
  end if;

  v_fee := v_rule.flat_amount + ((p_amount * v_rule.bps + 9999) / 10000);
  v_fee := greatest(v_fee, v_rule.min_fee);
  if v_rule.max_fee is not null then
    v_fee := least(v_fee, v_rule.max_fee);
  end if;
  return v_fee;
end;
$$;

create or replace function public.used_amount(
  p_user_id uuid,
  p_operation text,
  p_from timestamptz
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  if p_operation = 'withdrawal' then
    -- Levantamentos falhados (valor devolvido) deixam de contar para o limite.
    select coalesce(sum(amount), 0) into v_total
      from public.payment_requests
     where user_id = p_user_id
       and kind = 'withdrawal'
       and status <> 'failed'
       and created_at >= p_from;
  else
    select coalesce(sum(amount), 0) into v_total
      from public.transactions
     where initiator_id = p_user_id
       and type = case p_operation
                    when 'transfer' then 'transfer'::public.transaction_type
                    else 'merchant_payment'::public.transaction_type
                  end
       and created_at >= p_from;
  end if;
  return v_total;
end;
$$;

create or replace function public.enforce_limits(
  p_user_id uuid,
  p_operation text,
  p_amount bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_level smallint;
  v_rule record;
  v_used bigint;
  v_from timestamptz;
begin
  if p_user_id is null
     or p_amount is null or p_amount <= 0
     or p_operation not in ('transfer', 'merchant_payment', 'withdrawal') then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;

  -- Bloqueia o perfil: serializa operacoes concorrentes do mesmo utilizador.
  select kyc_level into v_level from public.profiles where user_id = p_user_id for update;

  if not exists (
    select 1 from public.limit_rules
     where kyc_level = v_level and operation = p_operation
  ) then
    raise exception 'operacao nao permitida neste nivel de verificacao' using errcode = 'NJ012';
  end if;

  for v_rule in
    select period, max_amount
      from public.limit_rules
     where kyc_level = v_level and operation = p_operation
  loop
    if v_rule.period = 'tx' then
      if p_amount > v_rule.max_amount then
        raise exception 'limite por operacao excedido' using errcode = 'NJ011';
      end if;
    else
      if v_rule.period = 'day' then
        v_from := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
      else
        v_from := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
      end if;

      -- O consumo ja inclui a operacao em curso (inserida antes desta verificacao).
      v_used := public.used_amount(p_user_id, p_operation, v_from);
      if v_used > v_rule.max_amount then
        raise exception 'limite % excedido', v_rule.period using errcode = 'NJ011';
      end if;
    end if;
  end loop;
end;
$$;

-- Substitui post_ledger_transfer: igual a versao anterior, mais limites e tarifas
-- para operacoes iniciadas por um utilizador (transferencia, pagamento, levantamento).
create or replace function public.post_ledger_transfer(
  p_idempotency_key text,
  p_type public.transaction_type,
  p_from_account uuid,
  p_to_account uuid,
  p_amount bigint,
  p_currency text,
  p_initiator uuid default null,
  p_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (out_transaction_id uuid, out_replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_fingerprint text;
  v_txn_id uuid;
  v_existing record;
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_from_balance bigint;
  v_to_balance bigint;
  v_fee bigint;
begin
  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 128 then
    raise exception 'chave de idempotencia invalida' using errcode = 'NJ001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'valor invalido' using errcode = 'NJ001';
  end if;
  if p_from_account is null or p_to_account is null or p_from_account = p_to_account then
    raise exception 'contas invalidas' using errcode = 'NJ001';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'moeda invalida' using errcode = 'NJ001';
  end if;

  v_fingerprint := md5(concat_ws('|',
    p_type::text, p_from_account::text, p_to_account::text, p_amount::text, p_currency));

  insert into public.transactions (
    type, currency, amount, idempotency_key, request_fingerprint,
    initiator_id, reference, metadata
  )
  values (
    p_type, p_currency, p_amount, p_idempotency_key, v_fingerprint,
    p_initiator, p_reference, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    select t.id, t.request_fingerprint into v_existing
      from public.transactions t
     where coalesce(t.initiator_id, v_zero) = coalesce(p_initiator, v_zero)
       and t.idempotency_key = p_idempotency_key;

    if found and v_existing.request_fingerprint = v_fingerprint then
      return query select v_existing.id, true;
      return;
    end if;
    raise exception 'chave de idempotencia reutilizada com dados diferentes'
      using errcode = 'NJ003';
  end if;

  -- Bloqueio das duas contas em ordem fixa de id (evita deadlocks).
  perform 1
    from public.accounts
   where id in (p_from_account, p_to_account)
   order by id
     for update;

  select * into v_from from public.accounts where id = p_from_account;
  if not found or v_from.status <> 'active' then
    raise exception 'conta de origem inexistente ou inativa' using errcode = 'NJ002';
  end if;

  select * into v_to from public.accounts where id = p_to_account;
  if not found or v_to.status <> 'active' then
    raise exception 'conta de destino inexistente ou inativa' using errcode = 'NJ002';
  end if;

  if v_from.currency <> p_currency or v_to.currency <> p_currency then
    raise exception 'moeda incompativel' using errcode = 'NJ005';
  end if;

  if not v_from.allow_negative and v_from.balance < p_amount then
    raise exception 'saldo insuficiente' using errcode = 'NJ004';
  end if;

  update public.accounts
     set balance = balance - p_amount
   where id = p_from_account
  returning balance into v_from_balance;

  update public.accounts
     set balance = balance + p_amount
   where id = p_to_account
  returning balance into v_to_balance;

  insert into public.ledger_entries (transaction_id, account_id, direction, amount, balance_after)
  values
    (v_txn_id, p_from_account, 'debit', p_amount, v_from_balance),
    (v_txn_id, p_to_account, 'credit', p_amount, v_to_balance);

  -- Limites e tarifas: so para operacoes iniciadas por utilizadores.
  -- Qualquer falha aqui reverte o movimento inteiro.
  if p_initiator is not null and p_type in ('transfer', 'merchant_payment', 'withdrawal') then
    perform public.enforce_limits(p_initiator, p_type::text, p_amount);

    v_fee := public.compute_fee(p_type::text, p_amount);
    if v_fee > 0 then
      perform public.post_ledger_transfer(
        'fee-' || v_txn_id::text, 'fee', p_from_account,
        public.system_account_id('fee_revenue', p_currency),
        v_fee, p_currency, p_initiator, null,
        jsonb_build_object('for_transaction', v_txn_id)
      );
    end if;
  end if;

  return query select v_txn_id, false;
end;
$$;

alter table public.limit_rules enable row level security;
alter table public.fee_rules enable row level security;

-- Limites e tarifas nao sao segredo: a app mostra-os ao utilizador.
create policy limit_rules_read on public.limit_rules
  for select to authenticated using (true);
create policy fee_rules_read on public.fee_rules
  for select to authenticated using (true);

revoke all on public.limit_rules from anon, authenticated;
revoke all on public.fee_rules from anon, authenticated;
grant select on public.limit_rules, public.fee_rules to authenticated;

revoke execute on function public.compute_fee(text, bigint)
  from public, anon, authenticated;
revoke execute on function public.used_amount(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.enforce_limits(uuid, text, bigint)
  from public, anon, authenticated;

grant execute on function public.compute_fee(text, bigint) to service_role;
grant execute on function public.used_amount(uuid, text, timestamptz) to service_role;
grant execute on function public.enforce_limits(uuid, text, bigint) to service_role;
