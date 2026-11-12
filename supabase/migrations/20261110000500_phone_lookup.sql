create or replace function public.find_user_id_by_phone(p_phone text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_digits text;
  v_id uuid;
begin
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_digits !~ '^245[0-9]{9}$' then
    return null;
  end if;

  select u.id
    into v_id
    from auth.users u
   where u.phone in (v_digits, '+' || v_digits)
     and u.phone_confirmed_at is not null
     and u.deleted_at is null
   limit 1;

  return v_id;
end;
$$;

revoke execute on function public.find_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_phone(text) to service_role;
