begin;

do $$
declare
  v_id uuid := gen_random_uuid();
  v_found uuid;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_id, '245955000001', now());

  v_found := public.find_user_id_by_phone('+245955000001');
  if v_found is distinct from v_id then
    raise exception 'esperava encontrar o utilizador, obtido %', v_found;
  end if;

  if public.find_user_id_by_phone('+245955999999') is not null then
    raise exception 'numero inexistente devia devolver null';
  end if;

  if public.find_user_id_by_phone('955000001') is not null then
    raise exception 'formato invalido devia devolver null';
  end if;

  raise notice 'PHONE LOOKUP TEST: OK';
end;
$$;

rollback;
