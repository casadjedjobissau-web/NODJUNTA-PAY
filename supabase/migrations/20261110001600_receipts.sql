-- Codigos de erro novos: NJ020 recibos sao imutaveis, NJ021 recibo nao disponivel.

create sequence public.receipt_number_seq;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  transaction_id uuid not null references public.transactions (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  direction text not null check (direction in ('in', 'out')),
  kind text not null check (kind in ('transfer', 'merchant_payment', 'deposit', 'withdrawal', 'reversal')),
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  counterparty_label text,
  counterparty_detail text,
  reference text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint receipts_transaction_user_uq unique (transaction_id, user_id)
);

create index receipts_user_idx on public.receipts (user_id, created_at desc);

create or replace function public.prevent_receipt_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Recibos sao imutaveis' using errcode = 'NJ020';
end;
$$;

create trigger receipts_no_mutation
  before update or delete on public.receipts
  for each row execute function public.prevent_receipt_mutation();

create trigger receipts_no_truncate
  before truncate on public.receipts
  for each statement execute function public.prevent_receipt_mutation();

alter table public.receipts enable row level security;

create policy receipts_select_own on public.receipts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.receipts from anon, authenticated;
grant select on public.receipts to authenticated;

-- +245955000302 passa a +245 955 *** 302 (primeiros e ultimos tres digitos).
create or replace function public.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when s.d ~ '^245[0-9]{9}$' then '+245 ' || substr(s.d, 4, 3) || ' *** ' || substr(s.d, 10, 3)
    when char_length(s.d) >= 6 then '***' || right(s.d, 3)
    else null
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s
$$;

create or replace function public.get_or_create_receipt(p_user uuid, p_transaction uuid)
returns setof public.receipts
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_existing public.receipts%rowtype;
  v_new public.receipts%rowtype;
  v_tx public.transactions%rowtype;
  v_mine record;
  v_direction text;
  v_fee bigint;
  v_other uuid;
  v_label text;
  v_detail text;
  v_name text;
  v_phone text;
begin
  if p_user is null or p_transaction is null then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_existing
    from public.receipts
   where transaction_id = p_transaction and user_id = p_user;
  if found then
    return next v_existing;
    return;
  end if;

  select * into v_tx from public.transactions where id = p_transaction;
  if not found or v_tx.type not in ('transfer', 'merchant_payment', 'deposit', 'withdrawal', 'reversal') then
    raise exception 'recibo nao disponivel' using errcode = 'NJ021';
  end if;

  -- Só quem tem um movimento numa conta sua nesta transacao tem direito ao recibo.
  select e.direction as direction, e.account_id as account_id
    into v_mine
    from public.ledger_entries e
    join public.accounts a on a.id = e.account_id
   where e.transaction_id = p_transaction and a.owner_id = p_user
   limit 1;
  if not found then
    raise exception 'recibo nao disponivel' using errcode = 'NJ021';
  end if;

  v_direction := case when v_mine.direction = 'credit' then 'in' else 'out' end;

  v_fee := 0;
  if v_direction = 'out' then
    select t.amount into v_fee
      from public.transactions t
     where t.initiator_id = p_user and t.idempotency_key = 'fee-' || p_transaction::text;
    v_fee := coalesce(v_fee, 0);
  end if;

  if v_tx.type = 'merchant_payment' and v_direction = 'out' then
    select m.business_name, m.merchant_code
      into v_label, v_detail
      from public.ledger_entries e
      join public.accounts a on a.id = e.account_id
      join public.merchants m on m.owner_id = a.owner_id
     where e.transaction_id = p_transaction and e.account_id <> v_mine.account_id
     limit 1;
  elsif v_tx.type in ('transfer', 'merchant_payment') then
    select a.owner_id into v_other
      from public.ledger_entries e
      join public.accounts a on a.id = e.account_id
     where e.transaction_id = p_transaction
       and e.account_id <> v_mine.account_id
       and a.owner_id is not null
     limit 1;
    if v_other is not null then
      select p.full_name into v_name from public.profiles p where p.user_id = v_other;
      select u.phone into v_phone from auth.users u where u.id = v_other;
      v_label := coalesce(v_name, case when v_tx.type = 'merchant_payment' then 'Cliente' else 'Utilizador' end);
      v_detail := public.mask_phone(v_phone);
    end if;
  elsif v_tx.type = 'deposit' then
    v_label := 'Depósito na carteira';
    select pr.provider into v_detail
      from public.payment_requests pr
     where pr.settle_transaction_id = p_transaction
     limit 1;
  elsif v_tx.type = 'withdrawal' then
    v_label := 'Levantamento';
    select public.mask_phone(pr.destination) into v_detail
      from public.payment_requests pr
     where pr.hold_transaction_id = p_transaction
     limit 1;
  else
    v_label := 'Devolução';
  end if;

  insert into public.receipts (
    receipt_number, transaction_id, user_id, direction, kind, amount, fee, currency,
    counterparty_label, counterparty_detail, reference, occurred_at
  )
  values (
    'NP-' || to_char(v_tx.created_at at time zone 'UTC', 'YYMMDD') || '-'
      || lpad(nextval('public.receipt_number_seq')::text, 6, '0'),
    p_transaction, p_user, v_direction, v_tx.type::text, v_tx.amount, v_fee, v_tx.currency,
    v_label, v_detail, v_tx.reference, v_tx.created_at
  )
  on conflict (transaction_id, user_id) do nothing
  returning * into v_new;

  if v_new.id is null then
    select * into v_new
      from public.receipts
     where transaction_id = p_transaction and user_id = p_user;
  end if;

  return next v_new;
  return;
end;
$$;

revoke execute on function public.mask_phone(text) from public, anon, authenticated;
revoke execute on function public.get_or_create_receipt(uuid, uuid) from public, anon, authenticated;

grant execute on function public.mask_phone(text) to service_role;
grant execute on function public.get_or_create_receipt(uuid, uuid) to service_role;
