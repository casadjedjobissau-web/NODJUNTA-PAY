begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_row record;
begin
  insert into auth.users (id, email)
  values (v_user, 'p@pin.local'), (v_other, 'o@pin.local');

  select * into v_row from public.pin_get_status(v_user);
  if v_row.out_has_pin then raise exception 'nao devia ter PIN'; end if;

  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_status <> 'not_set' then raise exception 'esperava not_set, obtido %', v_row.out_status; end if;

  perform public.pin_set_initial(v_user, 'hash-de-teste-com-mais-de-vinte-caracteres');

  begin
    perform public.pin_set_initial(v_user, 'outro-hash-de-teste-com-mais-de-vinte');
    raise exception 'esperava NJ019';
  exception when sqlstate 'NJ019' then null;
  end;

  select * into v_row from public.pin_get_status(v_user);
  if not v_row.out_has_pin or v_row.out_locked_until is not null then
    raise exception 'estado inicial incorreto';
  end if;

  -- tentativa 1 e 2: restam 2 e 1
  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_status <> 'ok' or v_row.out_attempts_left <> 2 or v_row.out_hash is null then
    raise exception 'tentativa 1 incorreta';
  end if;
  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_attempts_left <> 1 then raise exception 'tentativa 2: esperava 1, obtido %', v_row.out_attempts_left; end if;

  -- tentativa 3: ultima, fica bloqueado
  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_status <> 'ok' or v_row.out_attempts_left <> 0 or v_row.out_locked_until is null then
    raise exception 'tentativa 3 devia ativar o bloqueio';
  end if;

  -- tentativa 4: bloqueado, sem hash
  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_status <> 'locked' or v_row.out_hash is not null then
    raise exception 'tentativa 4 devia estar bloqueada';
  end if;

  select * into v_row from public.pin_get_status(v_user);
  if v_row.out_locked_until is null then raise exception 'estado devia mostrar bloqueio'; end if;

  -- um PIN certo limpa o bloqueio
  perform public.pin_confirm_success(v_user);
  select * into v_row from public.pin_get_status(v_user);
  if v_row.out_locked_until is not null then raise exception 'bloqueio devia ter sido limpo'; end if;
  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_status <> 'ok' or v_row.out_attempts_left <> 2 then
    raise exception 'contador devia ter recomecado';
  end if;

  -- trocar o PIN reinicia o contador
  perform public.pin_replace(v_user, 'novo-hash-de-teste-com-mais-de-vinte-car');
  select * into v_row from public.pin_reserve_attempt(v_user, 3, 60);
  if v_row.out_attempts_left <> 2 or v_row.out_hash <> 'novo-hash-de-teste-com-mais-de-vinte-car' then
    raise exception 'troca de PIN incorreta';
  end if;

  -- trocar sem PIN existente cria-o
  perform public.pin_replace(v_other, 'hash-do-outro-utilizador-com-mais-de-vinte');
  select * into v_row from public.pin_get_status(v_other);
  if not v_row.out_has_pin then raise exception 'pin_replace devia criar o PIN'; end if;

  -- argumentos invalidos
  begin
    perform public.pin_reserve_attempt(v_user, 0, 60);
    raise exception 'esperava NJ001';
  exception when sqlstate 'NJ001' then null;
  end;

  raise notice 'PIN SMOKE TEST: OK';
end;
$$;

rollback;
