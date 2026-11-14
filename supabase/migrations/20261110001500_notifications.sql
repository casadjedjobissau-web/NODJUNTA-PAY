-- Notificacoes criadas dentro da base de dados, na mesma transacao do evento que as origina.
-- Uma falha ao criar uma notificacao NUNCA impede a operacao original.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'transfer_received', 'payment_received', 'deposit_completed', 'deposit_failed',
    'withdrawal_completed', 'withdrawal_failed', 'kyc_approved', 'kyc_rejected',
    'merchant_active', 'merchant_suspended', 'security', 'system'
  )),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 300),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_state text not null default 'pending'
    check (push_state in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  push_attempts integer not null default 0 check (push_attempts >= 0),
  push_claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, seq desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_push_idx on public.notifications (push_state, seq)
  where push_state in ('pending', 'sending');

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.format_money_text(p_amount bigint, p_currency text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select replace(to_char(p_amount, 'FM999,999,999,999,999,999'), ',', chr(160)) || chr(160) || p_currency
$$;

create or replace function public.create_notification(
  p_user uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Dinheiro recebido: transferencias e pagamentos a comerciantes.
create or replace function public.trg_notify_ledger_credit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_account_type public.account_type;
  v_tx public.transactions%rowtype;
begin
  if new.direction <> 'credit' then
    return null;
  end if;

  select a.owner_id, a.type into v_owner, v_account_type
    from public.accounts a where a.id = new.account_id;
  if v_owner is null then
    return null;
  end if;

  select * into v_tx from public.transactions t where t.id = new.transaction_id;

  if v_tx.type = 'transfer' and v_account_type = 'user_wallet' then
    perform public.create_notification(
      v_owner, 'transfer_received', 'Dinheiro recebido',
      'Recebeu ' || public.format_money_text(new.amount, v_tx.currency) || '.',
      jsonb_build_object(
        'transaction_id', v_tx.id, 'amount', new.amount,
        'currency', v_tx.currency, 'reference', v_tx.reference
      )
    );
  elsif v_tx.type = 'merchant_payment' and v_account_type = 'merchant_wallet' then
    perform public.create_notification(
      v_owner, 'payment_received', 'Pagamento recebido',
      'Recebeu ' || public.format_money_text(new.amount, v_tx.currency) || ' de um cliente.',
      jsonb_build_object(
        'transaction_id', v_tx.id, 'amount', new.amount,
        'currency', v_tx.currency, 'reference', v_tx.reference
      )
    );
  end if;

  return null;
exception when others then
  raise warning 'notificacao nao criada (ledger): %', sqlerrm;
  return null;
end;
$$;

create trigger ledger_entries_notify
  after insert on public.ledger_entries
  for each row execute function public.trg_notify_ledger_credit();

-- Depositos e levantamentos concluidos ou falhados.
create or replace function public.trg_notify_payment_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_money text := public.format_money_text(new.amount, new.currency);
  v_data jsonb := jsonb_build_object('request_id', new.id, 'amount', new.amount, 'currency', new.currency);
begin
  if new.status = 'completed' and new.kind = 'deposit' then
    perform public.create_notification(new.user_id, 'deposit_completed', 'Depósito concluído',
      v_money || ' creditado na sua carteira.', v_data);
  elsif new.status = 'completed' and new.kind = 'withdrawal' then
    perform public.create_notification(new.user_id, 'withdrawal_completed', 'Levantamento concluído',
      'O levantamento de ' || v_money || ' foi concluído.', v_data);
  elsif new.status = 'failed' and new.kind = 'deposit' then
    perform public.create_notification(new.user_id, 'deposit_failed', 'Depósito falhado',
      'O depósito de ' || v_money || ' não foi concluído. Nada foi creditado.', v_data);
  elsif new.status = 'failed' and new.kind = 'withdrawal' then
    perform public.create_notification(new.user_id, 'withdrawal_failed', 'Levantamento falhado',
      'O levantamento de ' || v_money || ' falhou. O valor foi devolvido ao seu saldo.', v_data);
  end if;
  return null;
exception when others then
  raise warning 'notificacao nao criada (pedido): %', sqlerrm;
  return null;
end;
$$;

create trigger payment_requests_notify
  after update of status on public.payment_requests
  for each row when (old.status is distinct from new.status)
  execute function public.trg_notify_payment_request();

-- Verificacao de identidade decidida.
create or replace function public.trg_notify_kyc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' then
    perform public.create_notification(new.user_id, 'kyc_approved', 'Verificação aprovada',
      'O seu nível de verificação subiu para o nível ' || new.target_level || '.',
      jsonb_build_object('submission_id', new.id, 'level', new.target_level));
  elsif new.status = 'rejected' then
    perform public.create_notification(new.user_id, 'kyc_rejected', 'Verificação recusada',
      'O seu pedido de verificação foi recusado. Abra a app para ver o motivo.',
      jsonb_build_object('submission_id', new.id));
  end if;
  return null;
exception when others then
  raise warning 'notificacao nao criada (kyc): %', sqlerrm;
  return null;
end;
$$;

create trigger kyc_submissions_notify
  after update of status on public.kyc_submissions
  for each row when (old.status is distinct from new.status and new.status in ('approved', 'rejected'))
  execute function public.trg_notify_kyc();

-- Comerciante ativado ou suspenso.
create or replace function public.trg_notify_merchant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' then
    perform public.create_notification(new.owner_id, 'merchant_active', 'Negócio aprovado',
      'O seu negócio "' || new.business_name || '" já pode receber pagamentos.',
      jsonb_build_object('merchant_code', new.merchant_code));
  elsif new.status = 'suspended' then
    perform public.create_notification(new.owner_id, 'merchant_suspended', 'Negócio suspenso',
      'O seu negócio "' || new.business_name || '" foi suspenso. Contacte o suporte.',
      jsonb_build_object('merchant_code', new.merchant_code));
  end if;
  return null;
exception when others then
  raise warning 'notificacao nao criada (comerciante): %', sqlerrm;
  return null;
end;
$$;

create trigger merchants_notify
  after update of status on public.merchants
  for each row when (old.status is distinct from new.status and new.status in ('active', 'suspended'))
  execute function public.trg_notify_merchant();

-- Alerta de seguranca quando o PIN muda.
create or replace function public.trg_notify_pin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.user_id, 'security', 'PIN alterado',
    'O seu PIN foi alterado. Se não foi você, contacte o suporte de imediato.', '{}'::jsonb);
  return null;
exception when others then
  raise warning 'notificacao nao criada (pin): %', sqlerrm;
  return null;
end;
$$;

create trigger user_pins_notify
  after update of pin_hash on public.user_pins
  for each row when (old.pin_hash is distinct from new.pin_hash)
  execute function public.trg_notify_pin_change();

-- Ciclo de push: reclama um lote (varias instancias nunca reclamam as mesmas linhas).
-- Linhas "sending" ha mais de 5 minutos voltam a ser reclamadas (recuperacao de falhas).
create or replace function public.notifications_claim_for_push(p_limit integer)
returns table (
  out_id uuid,
  out_user_id uuid,
  out_kind text,
  out_title text,
  out_body text,
  out_data jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  return query
  with picked as (
    select n.id
      from public.notifications n
     where n.push_state = 'pending'
        or (n.push_state = 'sending' and n.push_claimed_at < now() - interval '5 minutes')
     order by n.seq
     limit p_limit
       for update skip locked
  )
  update public.notifications n
     set push_state = 'sending', push_claimed_at = now()
    from picked
   where n.id = picked.id
  returning n.id, n.user_id, n.kind, n.title, n.body, n.data;
end;
$$;

-- "failed" volta a "pending" ate 3 tentativas; depois fica "failed".
create or replace function public.notifications_mark_push(p_ids uuid[], p_state text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer;
begin
  if p_ids is null or p_state is null or p_state not in ('sent', 'skipped', 'failed') then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  update public.notifications n
     set push_attempts = n.push_attempts + 1,
         push_claimed_at = null,
         push_state = case
           when p_state = 'failed' and n.push_attempts + 1 < 3 then 'pending'
           else p_state
         end
   where n.id = any(p_ids) and n.push_state = 'sending';
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke execute on function public.format_money_text(bigint, text) from public, anon, authenticated;
revoke execute on function public.create_notification(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.notifications_claim_for_push(integer) from public, anon, authenticated;
revoke execute on function public.notifications_mark_push(uuid[], text) from public, anon, authenticated;

grant execute on function public.format_money_text(bigint, text) to service_role;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.notifications_claim_for_push(integer) to service_role;
grant execute on function public.notifications_mark_push(uuid[], text) to service_role;
