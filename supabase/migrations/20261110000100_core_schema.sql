create type public.account_type as enum (
  'user_wallet', 'merchant_wallet', 'settlement', 'fee_revenue', 'suspense'
);

create type public.transaction_type as enum (
  'transfer', 'merchant_payment', 'deposit', 'withdrawal', 'fee', 'reversal', 'adjustment'
);

create type public.entry_direction as enum ('debit', 'credit');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete restrict,
  type public.account_type not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  balance bigint not null default 0,
  allow_negative boolean not null default false,
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_balance_non_negative check (allow_negative or balance >= 0),
  constraint accounts_owner_rule check (
    (type in ('user_wallet', 'merchant_wallet') and owner_id is not null)
    or (type not in ('user_wallet', 'merchant_wallet') and owner_id is null)
  ),
  constraint accounts_wallet_never_negative check (
    type not in ('user_wallet', 'merchant_wallet') or allow_negative = false
  )
);

comment on column public.accounts.balance is
  'Saldo em unidade menor da moeda (XOF nao tem subunidade). Convencao: creditos menos debitos.';

create unique index accounts_owner_type_currency_uq
  on public.accounts (owner_id, type, currency)
  where owner_id is not null;

create unique index accounts_system_type_currency_uq
  on public.accounts (type, currency)
  where owner_id is null;

create index accounts_owner_idx on public.accounts (owner_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type public.transaction_type not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount bigint not null check (amount > 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_fingerprint text not null,
  initiator_id uuid references auth.users (id) on delete restrict,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  reversal_of uuid references public.transactions (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index transactions_idempotency_uq
  on public.transactions (
    (coalesce(initiator_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    idempotency_key
  );

create index transactions_created_at_idx on public.transactions (created_at desc);
create index transactions_initiator_idx on public.transactions (initiator_id, created_at desc);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  direction public.entry_direction not null,
  amount bigint not null check (amount > 0),
  balance_after bigint not null,
  created_at timestamptz not null default now()
);

create index ledger_entries_account_idx on public.ledger_entries (account_id, id desc);
create index ledger_entries_transaction_idx on public.ledger_entries (transaction_id);

create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registos do livro-razao sao imutaveis' using errcode = 'NJ006';
end;
$$;

create trigger ledger_entries_no_mutation
  before update or delete on public.ledger_entries
  for each row execute function public.prevent_ledger_mutation();

create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.prevent_ledger_mutation();

create trigger transactions_no_mutation
  before update or delete on public.transactions
  for each row execute function public.prevent_ledger_mutation();

create trigger transactions_no_truncate
  before truncate on public.transactions
  for each statement execute function public.prevent_ledger_mutation();

create or replace function public.assert_transaction_balanced()
returns trigger
language plpgsql
as $$
declare
  v_diff bigint;
begin
  select coalesce(sum(case when direction = 'debit' then amount else -amount end), 0)
    into v_diff
    from public.ledger_entries
   where transaction_id = new.transaction_id;

  if v_diff <> 0 then
    raise exception 'Transacao desequilibrada: %', new.transaction_id using errcode = 'NJ007';
  end if;
  return null;
end;
$$;

create constraint trigger ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.assert_transaction_balanced();
