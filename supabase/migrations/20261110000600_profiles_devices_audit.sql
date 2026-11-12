create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 2 and 120),
  language text not null default 'pt' check (language in ('pt', 'kri')),
  kyc_level smallint not null default 0 check (kyc_level between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 128),
  platform text not null check (platform in ('ios', 'android')),
  push_token text check (push_token is null or char_length(push_token) <= 512),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint devices_user_device_uq unique (user_id, device_id)
);

create index devices_user_idx on public.devices (user_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_type text not null check (actor_type in ('user', 'admin', 'system', 'webhook')),
  action text not null check (char_length(action) between 1 and 200),
  entity_type text,
  entity_id text,
  ip text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs (actor_id, id desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registos de auditoria sao imutaveis' using errcode = 'NJ008';
end;
$$;

create trigger audit_logs_no_mutation
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_audit_mutation();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy devices_select_own on public.devices
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
revoke all on public.devices from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.profiles, public.devices to authenticated;
