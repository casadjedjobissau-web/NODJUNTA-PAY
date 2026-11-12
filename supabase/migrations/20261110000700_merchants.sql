create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete restrict,
  merchant_code text not null unique check (merchant_code ~ '^[0-9A-F]{8}$'),
  business_name text not null check (char_length(business_name) between 2 and 120),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function public.set_updated_at();

create or replace function public.register_merchant(
  p_owner_id uuid,
  p_business_name text,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
  v_attempt integer := 0;
begin
  if p_owner_id is null
     or p_business_name is null
     or char_length(trim(p_business_name)) < 2
     or char_length(trim(p_business_name)) > 120
     or p_currency is null
     or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select id into v_id from public.merchants where owner_id = p_owner_id;
  if found then
    return v_id;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.merchants (owner_id, merchant_code, business_name)
      values (p_owner_id, v_code, trim(p_business_name))
      returning id into v_id;
      exit;
    exception when unique_violation then
      select id into v_id from public.merchants where owner_id = p_owner_id;
      if found then
        return v_id;
      end if;
      if v_attempt >= 5 then
        raise exception 'nao foi possivel gerar codigo de comerciante' using errcode = 'NJ001';
      end if;
    end;
  end loop;

  perform public.create_wallet(p_owner_id, 'merchant_wallet', p_currency);
  return v_id;
end;
$$;

alter table public.merchants enable row level security;

create policy merchants_select_own on public.merchants
  for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.merchants from anon, authenticated;
grant select on public.merchants to authenticated;

revoke execute on function public.register_merchant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_merchant(uuid, text, text) to service_role;
