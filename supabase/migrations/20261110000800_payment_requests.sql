-- Codigos de erro novos: NJ009 estado invalido do pedido, NJ010 pedido inexistente.

create type public.payment_request_kind as enum ('deposit', 'withdrawal');
create type public.payment_request_status as enum ('pending', 'completed', 'failed');

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  kind public.payment_request_kind not null,
  amount bigint not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status public.payment_request_status not null default 'pending',
  provider text not null check (char_length(provider) between 1 and 40),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  destination text check (destination is null or destination ~ '^\+[0-9]{8,15}$'),
  hold_transaction_id uuid references public.transactions (id) on delete restrict,
  settle_transaction_id uuid references public.transactions (id) on delete restrict,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_requests_user_key_uq unique (user_id, idempotency_key),
  constraint payment_requests_withdrawal_destination check (
    kind <> 'withdrawal' or destination is not null
  )
);

create unique index payment_requests_provider_ref_uq
  on public.payment_requests (provider, provider_ref)
  where provider_ref is not null;

create index payment_requests_user_idx on public.payment_requests (user_id, created_at desc);
create index payment_requests_status_idx on public.payment_requests (status, created_at);

create trigger payment_requests_set_updated_at
  before update on public.payment_requests
  for each row execute function public.set_updated_at();

create or replace function public.system_account_id(
  p_type public.account_type,
  p_currency text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.accounts
   where type = p_type and currency = p_currency and owner_id is null;
  if v_id is null then
    raise exception 'conta de sistema inexistente: % %', p_type, p_currency using errcode = 'NJ002';
  end if;
  return v_id;
end;
$$;

create or replace function public.create_deposit_request(
  p_user_id uuid,
  p_amount bigint,
  p_currency text,
  p_provider text,
  p_idempotency_key text
)
returns table (out_request_id uuid, out_replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_existing public.payment_requests%rowtype;
begin
  if p_user_id is null
     or p_amount is null or p_amount <= 0
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or p_provider is null or char_length(p_provider) = 0
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.payment_requests (user_id, kind, amount, currency, provider, idempotency_key)
  values (p_user_id, 'deposit', p_amount, p_currency, p_provider, p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  select * into v_existing
    from public.payment_requests
   where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if v_existing.kind = 'deposit'
     and v_existing.amount = p_amount
     and v_existing.currency = p_currency then
    return query select v_existing.id, true;
    return;
  end if;

  raise exception 'chave de idempotencia reutilizada com dados diferentes' using errcode = 'NJ003';
end;
$$;

create or replace function public.create_withdrawal_request(
  p_user_id uuid,
  p_amount bigint,
  p_currency text,
  p_provider text,
  p_destination text,
  p_idempotency_key text
)
returns table (out_request_id uuid, out_replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_existing public.payment_requests%rowtype;
  v_wallet uuid;
  v_suspense uuid;
  v_txn uuid;
begin
  if p_user_id is null
     or p_amount is null or p_amount <= 0
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or p_provider is null or char_length(p_provider) = 0
     or p_destination is null or p_destination !~ '^\+[0-9]{8,15}$'
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.payment_requests (
    user_id, kind, amount, currency, provider, destination, idempotency_key
  )
  values (p_user_id, 'withdrawal', p_amount, p_currency, p_provider, p_destination, p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    -- Retem o valor de imediato. Se faltar saldo (NJ004), toda a funcao e revertida.
    v_wallet := public.create_wallet(p_user_id, 'user_wallet', p_currency);
    v_suspense := public.system_account_id('suspense', p_currency);

    select out_transaction_id into v_txn
      from public.post_ledger_transfer(
        'wd-hold-' || v_id::text, 'withdrawal', v_wallet, v_suspense,
        p_amount, p_currency, p_user_id, null,
        jsonb_build_object('request_id', v_id, 'stage', 'hold')
      );

    update public.payment_requests set hold_transaction_id = v_txn where id = v_id;
    return query select v_id, false;
    return;
  end if;

  select * into v_existing
    from public.payment_requests
   where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if v_existing.kind = 'withdrawal'
     and v_existing.amount = p_amount
     and v_existing.currency = p_currency
     and v_existing.destination = p_destination then
    return query select v_existing.id, true;
    return;
  end if;

  raise exception 'chave de idempotencia reutilizada com dados diferentes' using errcode = 'NJ003';
end;
$$;

create or replace function public.settle_payment_request(
  p_request_id uuid,
  p_provider_ref text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.payment_requests%rowtype;
  v_txn uuid;
  v_wallet uuid;
  v_settlement uuid;
  v_suspense uuid;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'pedido inexistente' using errcode = 'NJ010';
  end if;
  if v_req.status = 'completed' then
    return 'completed';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'estado invalido: %', v_req.status using errcode = 'NJ009';
  end if;

  v_settlement := public.system_account_id('settlement', v_req.currency);

  if v_req.kind = 'deposit' then
    v_wallet := public.create_wallet(v_req.user_id, 'user_wallet', v_req.currency);
    select out_transaction_id into v_txn
      from public.post_ledger_transfer(
        'dep-' || v_req.id::text, 'deposit', v_settlement, v_wallet,
        v_req.amount, v_req.currency, null, null,
        jsonb_build_object('request_id', v_req.id, 'stage', 'settle')
      );
  else
    v_suspense := public.system_account_id('suspense', v_req.currency);
    select out_transaction_id into v_txn
      from public.post_ledger_transfer(
        'wd-settle-' || v_req.id::text, 'withdrawal', v_suspense, v_settlement,
        v_req.amount, v_req.currency, null, null,
        jsonb_build_object('request_id', v_req.id, 'stage', 'settle')
      );
  end if;

  update public.payment_requests
     set status = 'completed',
         settle_transaction_id = v_txn,
         provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = v_req.id;

  return 'completed';
end;
$$;

create or replace function public.fail_payment_request(
  p_request_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.payment_requests%rowtype;
  v_wallet uuid;
  v_suspense uuid;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'pedido inexistente' using errcode = 'NJ010';
  end if;
  if v_req.status = 'failed' then
    return 'failed';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'estado invalido: %', v_req.status using errcode = 'NJ009';
  end if;

  if v_req.kind = 'withdrawal' then
    v_wallet := public.create_wallet(v_req.user_id, 'user_wallet', v_req.currency);
    v_suspense := public.system_account_id('suspense', v_req.currency);
    perform public.post_ledger_transfer(
      'wd-rev-' || v_req.id::text, 'reversal', v_suspense, v_wallet,
      v_req.amount, v_req.currency, null, null,
      jsonb_build_object('request_id', v_req.id, 'stage', 'reverse')
    );
  end if;

  update public.payment_requests
     set status = 'failed',
         failure_reason = nullif(left(coalesce(p_reason, ''), 200), '')
   where id = v_req.id;

  return 'failed';
end;
$$;

alter table public.payment_requests enable row level security;

create policy payment_requests_select_own on public.payment_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.payment_requests from anon, authenticated;
grant select on public.payment_requests to authenticated;

revoke execute on function public.system_account_id(public.account_type, text)
  from public, anon, authenticated;
revoke execute on function public.create_deposit_request(uuid, bigint, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.create_withdrawal_request(uuid, bigint, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.settle_payment_request(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.fail_payment_request(uuid, text)
  from public, anon, authenticated;

grant execute on function public.system_account_id(public.account_type, text) to service_role;
grant execute on function public.create_deposit_request(uuid, bigint, text, text, text) to service_role;
grant execute on function public.create_withdrawal_request(uuid, bigint, text, text, text, text) to service_role;
grant execute on function public.settle_payment_request(uuid, text) to service_role;
grant execute on function public.fail_payment_request(uuid, text) to service_role;
