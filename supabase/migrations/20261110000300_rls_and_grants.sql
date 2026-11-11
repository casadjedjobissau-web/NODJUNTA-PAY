alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.ledger_entries enable row level security;

create policy accounts_select_own on public.accounts
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy ledger_entries_select_own on public.ledger_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.accounts a
       where a.id = ledger_entries.account_id
         and a.owner_id = (select auth.uid())
    )
  );

create policy transactions_select_own on public.transactions
  for select to authenticated
  using (
    exists (
      select 1
        from public.ledger_entries e
        join public.accounts a on a.id = e.account_id
       where e.transaction_id = transactions.id
         and a.owner_id = (select auth.uid())
    )
  );

create or replace view public.ledger_integrity_issues
with (security_invoker = true) as
select
  'balance_mismatch'::text as issue,
  a.id::text as ref,
  ('saldo=' || a.balance::text || ' entradas=' || coalesce(s.total, 0)::text) as detail
from public.accounts a
left join (
  select account_id,
         sum(case when direction = 'credit' then amount else -amount end) as total
    from public.ledger_entries
   group by account_id
) s on s.account_id = a.id
where a.balance <> coalesce(s.total, 0)
union all
select
  'unbalanced_transaction'::text,
  x.transaction_id::text,
  ('diferenca=' || x.diff::text)
from (
  select transaction_id,
         sum(case when direction = 'debit' then amount else -amount end) as diff
    from public.ledger_entries
   group by transaction_id
  having sum(case when direction = 'debit' then amount else -amount end) <> 0
) x;

-- Clientes autenticados so leem (via RLS). Nunca escrevem saldos.
revoke all on public.accounts from anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.ledger_entries from anon, authenticated;
revoke all on public.ledger_integrity_issues from anon, authenticated;
grant select on public.accounts, public.transactions, public.ledger_entries to authenticated;

revoke execute on function public.create_wallet(uuid, public.account_type, text)
  from public, anon, authenticated;
revoke execute on function public.post_ledger_transfer(
  text, public.transaction_type, uuid, uuid, bigint, text, uuid, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_wallet(uuid, public.account_type, text) to service_role;
grant execute on function public.post_ledger_transfer(
  text, public.transaction_type, uuid, uuid, bigint, text, uuid, text, jsonb
) to service_role;
grant select on public.ledger_integrity_issues to service_role;
