-- Codigos de erro: NJ001 argumento invalido, NJ002 conta inexistente/inativa,
-- NJ003 conflito de idempotencia, NJ004 saldo insuficiente, NJ005 moeda diferente.

create or replace function public.create_wallet(
  p_owner_id uuid,
  p_type public.account_type,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_owner_id is null or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;
  if p_type not in ('user_wallet', 'merchant_wallet') then
    raise exception 'tipo de conta invalido para carteira' using errcode = 'NJ001';
  end if;

  insert into public.accounts (owner_id, type, currency)
  values (p_owner_id, p_type, p_currency)
  on conflict (owner_id, type, currency) where owner_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
      from public.accounts
     where owner_id = p_owner_id and type = p_type and currency = p_currency;
  end if;

  return v_id;
end;
$$;

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

  return query select v_txn_id, false;
end;
$$;
