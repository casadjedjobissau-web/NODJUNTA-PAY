-- Codigo de erro novo: NJ018 registo nao encontrado (administracao).

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('support', 'reviewer', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.admin_overview()
returns table (
  pending_kyc bigint,
  pending_merchants bigint,
  pending_funding bigint,
  failed_webhooks bigint,
  frozen_wallets bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.kyc_submissions where status = 'pending'),
    (select count(*) from public.merchants where status = 'pending'),
    (select count(*) from public.payment_requests where status = 'pending'),
    (select count(*) from public.webhook_events where status = 'failed'),
    (select count(*) from public.accounts where status = 'frozen')
$$;

create or replace function public.admin_list_kyc(p_status text, p_limit integer)
returns table (
  id uuid,
  user_id uuid,
  phone text,
  full_name text,
  current_level smallint,
  target_level smallint,
  document_type text,
  status text,
  review_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select s.id, s.user_id, u.phone::text, p.full_name,
         coalesce(p.kyc_level, 0)::smallint,
         s.target_level, s.document_type, s.status, s.review_reason,
         s.submitted_at, s.reviewed_at
    from public.kyc_submissions s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.user_id = s.user_id
   where s.status = p_status
   order by case when p_status = 'pending' then 0 else 1 end,
            case when p_status = 'pending' then coalesce(s.submitted_at, s.created_at) end asc,
            coalesce(s.submitted_at, s.created_at) desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.admin_list_merchants(p_status text, p_limit integer)
returns table (
  merchant_code text,
  business_name text,
  owner_id uuid,
  owner_phone text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select m.merchant_code, m.business_name, m.owner_id, u.phone::text, m.status, m.created_at
    from public.merchants m
    join auth.users u on u.id = m.owner_id
   where p_status is null or m.status = p_status
   order by m.created_at asc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.admin_lookup_user(p_phone text)
returns table (
  user_id uuid,
  phone text,
  full_name text,
  kyc_level smallint,
  wallet_balance bigint,
  wallet_status text,
  merchant_code text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.id, u.phone::text, p.full_name,
         coalesce(p.kyc_level, 0)::smallint,
         a.balance, a.status, m.merchant_code, u.created_at
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.accounts a on a.owner_id = u.id and a.type = 'user_wallet'
    left join public.merchants m on m.owner_id = u.id
   where regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') ~ '^245[0-9]{9}$'
     and u.phone in (
       regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
       '+' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     )
     and u.deleted_at is null
   limit 1
$$;

create or replace function public.admin_set_merchant_status(
  p_admin uuid,
  p_merchant_code text,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.merchants%rowtype;
begin
  if p_admin is null
     or p_status is null or p_status not in ('active', 'suspended')
     or p_merchant_code is null or p_merchant_code !~ '^[0-9A-F]{8}$' then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_m from public.merchants where merchant_code = p_merchant_code for update;
  if not found then
    raise exception 'comerciante inexistente' using errcode = 'NJ018';
  end if;
  if v_m.owner_id = p_admin then
    raise exception 'nao pode alterar o proprio registo' using errcode = 'NJ017';
  end if;
  if v_m.status = p_status then
    return p_status;
  end if;

  update public.merchants set status = p_status where id = v_m.id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (
    p_admin, 'admin', 'ADMIN_MERCHANT_STATUS', 'merchant', v_m.merchant_code,
    jsonb_build_object('from', v_m.status, 'to', p_status)
  );

  return p_status;
end;
$$;

create or replace function public.admin_set_wallet_frozen(
  p_admin uuid,
  p_user_id uuid,
  p_frozen boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new text;
  v_changed integer;
begin
  if p_admin is null or p_user_id is null or p_frozen is null then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;
  if p_frozen and (p_reason is null or char_length(trim(p_reason)) = 0) then
    raise exception 'o congelamento exige um motivo' using errcode = 'NJ001';
  end if;
  if p_admin = p_user_id then
    raise exception 'nao pode alterar a propria conta' using errcode = 'NJ017';
  end if;
  if not exists (
    select 1 from public.accounts
     where owner_id = p_user_id and type in ('user_wallet', 'merchant_wallet')
  ) then
    raise exception 'conta inexistente' using errcode = 'NJ018';
  end if;

  v_new := case when p_frozen then 'frozen' else 'active' end;

  update public.accounts
     set status = v_new
   where owner_id = p_user_id
     and type in ('user_wallet', 'merchant_wallet')
     and status <> 'closed'
     and status <> v_new;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
    values (
      p_admin, 'admin',
      case when p_frozen then 'ADMIN_WALLET_FREEZE' else 'ADMIN_WALLET_UNFREEZE' end,
      'user', p_user_id::text,
      jsonb_build_object('reason', left(coalesce(trim(p_reason), ''), 300), 'accounts', v_changed)
    );
  end if;

  return v_new;
end;
$$;

revoke execute on function public.admin_overview() from public, anon, authenticated;
revoke execute on function public.admin_list_kyc(text, integer) from public, anon, authenticated;
revoke execute on function public.admin_list_merchants(text, integer) from public, anon, authenticated;
revoke execute on function public.admin_lookup_user(text) from public, anon, authenticated;
revoke execute on function public.admin_set_merchant_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_wallet_frozen(uuid, uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_list_kyc(text, integer) to service_role;
grant execute on function public.admin_list_merchants(text, integer) to service_role;
grant execute on function public.admin_lookup_user(text) to service_role;
grant execute on function public.admin_set_merchant_status(uuid, text, text) to service_role;
grant execute on function public.admin_set_wallet_frozen(uuid, uuid, boolean, text) to service_role;
