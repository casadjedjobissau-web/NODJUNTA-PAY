-- Codigo de erro novo: NJ019 o PIN ja esta definido.

create table public.user_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null check (char_length(pin_hash) between 20 and 400),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_pins_set_updated_at
  before update on public.user_pins
  for each row execute function public.set_updated_at();

alter table public.user_pins enable row level security;
revoke all on public.user_pins from anon, authenticated;

create or replace function public.pin_get_status(p_user uuid)
returns table (out_has_pin boolean, out_locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.user_pins%rowtype;
begin
  select * into v_row from public.user_pins where user_id = p_user;
  if not found then
    return query select false, null::timestamptz;
    return;
  end if;
  return query select true,
    case when v_row.locked_until is not null and v_row.locked_until > now()
         then v_row.locked_until else null::timestamptz end;
end;
$$;

create or replace function public.pin_set_initial(p_user uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer;
begin
  if p_user is null or p_hash is null or char_length(p_hash) < 20 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.user_pins (user_id, pin_hash)
  values (p_user, p_hash)
  on conflict (user_id) do nothing;
  get diagnostics v_changed = row_count;

  if v_changed = 0 then
    raise exception 'o PIN ja esta definido' using errcode = 'NJ019';
  end if;
end;
$$;

-- Reserva uma tentativa ANTES de verificar o PIN. O bloqueio da linha serializa pedidos
-- paralelos, por isso nunca ha mais de p_max tentativas por janela de bloqueio.
create or replace function public.pin_reserve_attempt(
  p_user uuid,
  p_max integer,
  p_lock_seconds integer
)
returns table (
  out_status text,
  out_hash text,
  out_attempts_left integer,
  out_locked_until timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.user_pins%rowtype;
  v_new integer;
  v_until timestamptz;
begin
  if p_user is null or p_max is null or p_max < 1 or p_lock_seconds is null or p_lock_seconds < 1 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_row from public.user_pins where user_id = p_user for update;
  if not found then
    return query select 'not_set'::text, null::text, 0, null::timestamptz;
    return;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return query select 'locked'::text, null::text, 0, v_row.locked_until;
    return;
  end if;

  v_new := v_row.failed_attempts + 1;
  if v_new >= p_max then
    v_until := now() + make_interval(secs => p_lock_seconds);
    update public.user_pins
       set failed_attempts = 0, locked_until = v_until
     where user_id = p_user;
    return query select 'ok'::text, v_row.pin_hash, 0, v_until;
  else
    update public.user_pins
       set failed_attempts = v_new, locked_until = null
     where user_id = p_user;
    return query select 'ok'::text, v_row.pin_hash, p_max - v_new, null::timestamptz;
  end if;
end;
$$;

create or replace function public.pin_confirm_success(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.user_pins
     set failed_attempts = 0, locked_until = null
   where user_id = p_user;
end;
$$;

create or replace function public.pin_replace(p_user uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null or p_hash is null or char_length(p_hash) < 20 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.user_pins (user_id, pin_hash)
  values (p_user, p_hash)
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end;
$$;

revoke execute on function public.pin_get_status(uuid) from public, anon, authenticated;
revoke execute on function public.pin_set_initial(uuid, text) from public, anon, authenticated;
revoke execute on function public.pin_reserve_attempt(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.pin_confirm_success(uuid) from public, anon, authenticated;
revoke execute on function public.pin_replace(uuid, text) from public, anon, authenticated;

grant execute on function public.pin_get_status(uuid) to service_role;
grant execute on function public.pin_set_initial(uuid, text) to service_role;
grant execute on function public.pin_reserve_attempt(uuid, integer, integer) to service_role;
grant execute on function public.pin_confirm_success(uuid) to service_role;
grant execute on function public.pin_replace(uuid, text) to service_role;
