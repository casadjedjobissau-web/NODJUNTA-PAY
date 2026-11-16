-- Relatorios para o painel de administracao. Sem dados pessoais: so totais.
-- Os dias contam em UTC. Codigo de erro reutilizado: NJ001 argumento invalido.

create or replace function public.admin_report_daily(p_from date, p_to date, p_currency text)
returns table (
  day date,
  transfers_count bigint,
  transfers_volume bigint,
  payments_count bigint,
  payments_volume bigint,
  deposits_count bigint,
  deposits_volume bigint,
  withdrawals_count bigint,
  withdrawals_volume bigint,
  fees_net bigint,
  new_users bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if p_from is null or p_to is null or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or p_to < p_from or (p_to - p_from) > 92 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  return query
  with bounds as (
    select (p_from::timestamp at time zone 'UTC') as t0,
           ((p_to + 1)::timestamp at time zone 'UTC') as t1
  ),
  days as (
    select g::date as d
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  tx_agg as (
    select (t.created_at at time zone 'UTC')::date as d,
           count(*) filter (where t.type = 'transfer') as tc,
           coalesce(sum(t.amount) filter (where t.type = 'transfer'), 0) as tv,
           count(*) filter (where t.type = 'merchant_payment') as pc,
           coalesce(sum(t.amount) filter (where t.type = 'merchant_payment'), 0) as pv,
           coalesce(sum(t.amount) filter (where t.type = 'fee'), 0)
             - coalesce(sum(t.amount) filter (
                 where t.type = 'reversal' and t.metadata ->> 'stage' = 'fee_reverse'), 0) as fees
      from public.transactions t, bounds b
     where t.currency = p_currency
       and t.created_at >= b.t0 and t.created_at < b.t1
     group by 1
  ),
  req_agg as (
    select (r.updated_at at time zone 'UTC')::date as d,
           count(*) filter (where r.kind = 'deposit') as dc,
           coalesce(sum(r.amount) filter (where r.kind = 'deposit'), 0) as dv,
           count(*) filter (where r.kind = 'withdrawal') as wc,
           coalesce(sum(r.amount) filter (where r.kind = 'withdrawal'), 0) as wv
      from public.payment_requests r, bounds b
     where r.status = 'completed' and r.currency = p_currency
       and r.updated_at >= b.t0 and r.updated_at < b.t1
     group by 1
  ),
  usr_agg as (
    select (u.created_at at time zone 'UTC')::date as d, count(*) as n
      from auth.users u, bounds b
     where u.deleted_at is null
       and u.created_at >= b.t0 and u.created_at < b.t1
     group by 1
  )
  select days.d,
         coalesce(tx_agg.tc, 0)::bigint,
         coalesce(tx_agg.tv, 0)::bigint,
         coalesce(tx_agg.pc, 0)::bigint,
         coalesce(tx_agg.pv, 0)::bigint,
         coalesce(req_agg.dc, 0)::bigint,
         coalesce(req_agg.dv, 0)::bigint,
         coalesce(req_agg.wc, 0)::bigint,
         coalesce(req_agg.wv, 0)::bigint,
         coalesce(tx_agg.fees, 0)::bigint,
         coalesce(usr_agg.n, 0)::bigint
    from days
    left join tx_agg on tx_agg.d = days.d
    left join req_agg on req_agg.d = days.d
    left join usr_agg on usr_agg.d = days.d
   order by days.d;
end;
$$;

create or replace function public.admin_report_summary(p_currency text)
returns table (
  user_wallets bigint,
  user_balance bigint,
  merchant_wallets bigint,
  merchant_balance bigint,
  fee_balance bigint,
  settlement_balance bigint,
  suspense_balance bigint,
  pending_deposits_count bigint,
  pending_deposits_amount bigint,
  pending_withdrawals_count bigint,
  pending_withdrawals_amount bigint,
  ledger_gap bigint
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    (select count(*) from public.accounts a
      where a.type = 'user_wallet' and a.currency = p_currency)::bigint,
    (select coalesce(sum(a.balance), 0) from public.accounts a
      where a.type = 'user_wallet' and a.currency = p_currency)::bigint,
    (select count(*) from public.accounts a
      where a.type = 'merchant_wallet' and a.currency = p_currency)::bigint,
    (select coalesce(sum(a.balance), 0) from public.accounts a
      where a.type = 'merchant_wallet' and a.currency = p_currency)::bigint,
    (select coalesce(sum(a.balance), 0) from public.accounts a
      where a.type = 'fee_revenue' and a.currency = p_currency)::bigint,
    (select coalesce(sum(a.balance), 0) from public.accounts a
      where a.type = 'settlement' and a.currency = p_currency)::bigint,
    (select coalesce(sum(a.balance), 0) from public.accounts a
      where a.type = 'suspense' and a.currency = p_currency)::bigint,
    (select count(*) from public.payment_requests r
      where r.status = 'pending' and r.kind = 'deposit' and r.currency = p_currency)::bigint,
    (select coalesce(sum(r.amount), 0) from public.payment_requests r
      where r.status = 'pending' and r.kind = 'deposit' and r.currency = p_currency)::bigint,
    (select count(*) from public.payment_requests r
      where r.status = 'pending' and r.kind = 'withdrawal' and r.currency = p_currency)::bigint,
    (select coalesce(sum(r.amount), 0) from public.payment_requests r
      where r.status = 'pending' and r.kind = 'withdrawal' and r.currency = p_currency)::bigint,
    -- A soma de todas as contas da moeda tem de ser sempre 0 (partidas dobradas).
    (select coalesce(sum(a.balance), 0) from public.accounts a
      where a.currency = p_currency)::bigint
$$;

create or replace function public.admin_report_merchants(
  p_from date,
  p_to date,
  p_currency text,
  p_limit integer
)
returns table (
  merchant_code text,
  business_name text,
  payments_count bigint,
  payments_volume bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if p_from is null or p_to is null or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or p_to < p_from or (p_to - p_from) > 92 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  return query
  select m.merchant_code,
         m.business_name,
         count(*)::bigint,
         coalesce(sum(t.amount), 0)::bigint
    from public.transactions t
    join public.merchants m on m.merchant_code = t.metadata ->> 'merchant_code'
   where t.type = 'merchant_payment'
     and t.currency = p_currency
     and t.created_at >= (p_from::timestamp at time zone 'UTC')
     and t.created_at < ((p_to + 1)::timestamp at time zone 'UTC')
   group by m.merchant_code, m.business_name
   order by 4 desc, 1 asc
   limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

revoke execute on function public.admin_report_daily(date, date, text) from public, anon, authenticated;
revoke execute on function public.admin_report_summary(text) from public, anon, authenticated;
revoke execute on function public.admin_report_merchants(date, date, text, integer) from public, anon, authenticated;

grant execute on function public.admin_report_daily(date, date, text) to service_role;
grant execute on function public.admin_report_summary(text) to service_role;
grant execute on function public.admin_report_merchants(date, date, text, integer) to service_role;
