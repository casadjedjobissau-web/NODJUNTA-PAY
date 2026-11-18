begin;

do $$
declare
  v_target uuid := gen_random_uuid();
  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_squatter uuid := gen_random_uuid();
  v_req uuid;
  v_req2 uuid;
  v_req3 uuid;
  v_row record;
  v_text text;
  v_n integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_target, '245955000701', now()), (v_a1, '245955000702', now()), (v_a2, '245955000703', now()),
         (v_other, '245955000704', now()), (v_staff, '245955000705', now());
  insert into public.profiles (user_id, full_name) values (v_target, 'Ana Gomes');
  insert into public.admin_users (user_id, role) values (v_a1, 'reviewer'), (v_a2, 'admin'), (v_staff, 'support');

  -- argumentos invalidos
  begin
    perform public.admin_phone_change_create(v_a1, v_target, '+351912345678', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ001 (formato)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, v_target, '+245955000799', 'ab', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ001 (motivo)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, v_target, '+245955000799', 'Perdeu o cartao SIM', 'curta');
    raise exception 'esperava NJ001 (prova)';
  exception when sqlstate 'NJ001' then null;
  end;

  -- ninguem altera a propria conta; contas inelegiveis; numeros indisponiveis
  begin
    perform public.admin_phone_change_create(v_a1, v_a1, '+245955000799', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ017';
  exception when sqlstate 'NJ017' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, gen_random_uuid(), '+245955000799', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ033 (inexistente)';
  exception when sqlstate 'NJ033' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, v_staff, '+245955000799', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ033 (administracao)';
  exception when sqlstate 'NJ033' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, v_target, '+245955000704', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ030 (em uso)';
  exception when sqlstate 'NJ030' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, v_target, '+245955000701', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ030 (o proprio numero)';
  exception when sqlstate 'NJ030' then null;
  end;

  -- criar um pedido
  v_req := public.admin_phone_change_create(
    v_a1, v_target, '+245955000799', '  Perdeu o cartao SIM  ', 'Identidade verificada em videochamada com o titular.');
  select * into v_row from public.phone_change_requests where id = v_req;
  if v_row.status <> 'pending' or v_row.old_phone <> '+245955000701' or v_row.new_phone <> '+245955000799'
     or v_row.reason <> 'Perdeu o cartao SIM' or v_row.created_by <> v_a1 or v_row.decided_by is not null then
    raise exception 'pedido incorreto';
  end if;
  select count(*) into v_n from public.audit_logs
   where action = 'ADMIN_PHONE_CHANGE_REQUEST' and entity_id = v_req::text and actor_id = v_a1;
  if v_n <> 1 then raise exception 'esperava 1 registo de auditoria do pedido, obtido %', v_n; end if;

  -- so um pedido pendente por utilizador e por numero
  begin
    perform public.admin_phone_change_create(v_a1, v_target, '+245955000798', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ032 (utilizador)';
  exception when sqlstate 'NJ032' then null;
  end;
  begin
    perform public.admin_phone_change_create(v_a1, v_other, '+245955000799', 'Perdeu o cartao SIM', 'Verificado em videochamada com o titular.');
    raise exception 'esperava NJ032 (numero)';
  exception when sqlstate 'NJ032' then null;
  end;

  -- lista: nome, numero antigo escondido, numero novo completo
  select * into v_row from public.admin_list_phone_changes('pending', 200) l where l.id = v_req;
  if v_row.full_name <> 'Ana Gomes' or v_row.old_phone_masked <> '+245 955 *** 701' or v_row.new_phone <> '+245955000799' then
    raise exception 'lista incorreta: % % %', v_row.full_name, v_row.old_phone_masked, v_row.new_phone;
  end if;
  select count(*) into v_n from public.admin_list_phone_changes('approved', 200) l where l.id = v_req;
  if v_n <> 0 then raise exception 'o pedido nao devia estar aprovado'; end if;
  select count(*) into v_n from public.admin_list_phone_changes(null, 200) l where l.id = v_req;
  if v_n <> 1 then raise exception 'o pedido devia aparecer sem filtro'; end if;

  -- quem pediu nao decide; o proprio utilizador tambem nao
  begin
    perform public.admin_phone_change_decide(v_a1, v_req, true, null);
    raise exception 'esperava NJ017 (quem pediu)';
  exception when sqlstate 'NJ017' then null;
  end;
  begin
    perform public.admin_phone_change_decide(v_target, v_req, true, null);
    raise exception 'esperava NJ017 (o proprio utilizador)';
  exception when sqlstate 'NJ017' then null;
  end;
  begin
    perform public.admin_phone_change_decide(v_a2, v_req, false, '   ');
    raise exception 'esperava NJ001 (recusa sem motivo)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_phone_change_decide(v_a2, gen_random_uuid(), true, null);
    raise exception 'esperava NJ031';
  exception when sqlstate 'NJ031' then null;
  end;
  begin
    perform public.admin_phone_change_decide(null, v_req, true, null);
    raise exception 'esperava NJ001 (administrador)';
  exception when sqlstate 'NJ001' then null;
  end;

  -- recusar: o numero nao muda
  v_text := public.admin_phone_change_decide(v_a2, v_req, false, 'Nao foi possivel confirmar a identidade.');
  if v_text <> 'rejected' then raise exception 'esperava rejected, obtido %', v_text; end if;
  select * into v_row from public.phone_change_requests where id = v_req;
  if v_row.status <> 'rejected' or v_row.decided_by <> v_a2 or v_row.decided_at is null
     or v_row.decision_reason <> 'Nao foi possivel confirmar a identidade.' then
    raise exception 'recusa incorreta';
  end if;
  select phone into v_text from auth.users where id = v_target;
  if v_text <> '245955000701' then raise exception 'o numero nao devia ter mudado, obtido %', v_text; end if;
  begin
    perform public.admin_phone_change_decide(v_a2, v_req, true, null);
    raise exception 'esperava NJ032 (ja decidido)';
  exception when sqlstate 'NJ032' then null;
  end;
  select count(*) into v_n from public.audit_logs
   where action = 'ADMIN_PHONE_CHANGE_DECIDE' and entity_id = v_req::text and actor_id = v_a2;
  if v_n <> 1 then raise exception 'esperava 1 registo de decisao, obtido %', v_n; end if;

  -- depois de recusado, pode pedir-se de novo; aprovar muda o numero
  v_req2 := public.admin_phone_change_create(
    v_a1, v_target, '+245955000799', 'Perdeu o cartao SIM', 'Identidade verificada presencialmente com o documento original.');
  v_text := public.admin_phone_change_decide(v_a2, v_req2, true, null);
  if v_text <> 'approved' then raise exception 'esperava approved, obtido %', v_text; end if;

  select * into v_row from auth.users where id = v_target;
  if v_row.phone <> '245955000799' or v_row.phone_confirmed_at is null then
    raise exception 'numero novo incorreto: %', v_row.phone;
  end if;
  if public.find_user_id_by_phone('+245955000799') is distinct from v_target then
    raise exception 'o numero novo devia pertencer a conta';
  end if;
  if public.find_user_id_by_phone('+245955000701') is not null then
    raise exception 'o numero antigo ja nao devia pertencer a ninguem';
  end if;
  select count(*) into v_n from auth.sessions where user_id = v_target;
  if v_n <> 0 then raise exception 'as sessoes deviam ter sido revogadas'; end if;
  select count(*) into v_n from public.notifications
   where user_id = v_target and kind = 'security' and title = 'Número alterado';
  if v_n <> 1 then raise exception 'esperava 1 alerta de seguranca, obtido %', v_n; end if;
  select * into v_row from public.phone_change_requests where id = v_req2;
  if v_row.status <> 'approved' or v_row.decided_by <> v_a2 then raise exception 'aprovacao incorreta'; end if;
  begin
    perform public.admin_phone_change_decide(v_a2, v_req2, true, null);
    raise exception 'esperava NJ032 (aprovado)';
  exception when sqlstate 'NJ032' then null;
  end;

  -- o numero e verificado outra vez ao aprovar
  v_req3 := public.admin_phone_change_create(
    v_a1, v_other, '+245955000798', 'Perdeu o cartao SIM', 'Identidade verificada em videochamada com o titular.');
  insert into auth.users (id, phone, phone_confirmed_at) values (v_squatter, '245955000798', now());
  begin
    perform public.admin_phone_change_decide(v_a2, v_req3, true, null);
    raise exception 'esperava NJ030 (ao aprovar)';
  exception when sqlstate 'NJ030' then null;
  end;
  select status into v_text from public.phone_change_requests where id = v_req3;
  if v_text <> 'pending' then raise exception 'o pedido devia continuar pendente, obtido %', v_text; end if;
  select phone into v_text from auth.users where id = v_other;
  if v_text <> '245955000704' then raise exception 'o numero nao devia ter mudado, obtido %', v_text; end if;
  v_text := public.admin_phone_change_decide(v_a2, v_req3, false, 'O numero ja esta em uso.');
  if v_text <> 'rejected' then raise exception 'esperava rejected, obtido %', v_text; end if;

  raise notice 'PHONE CHANGE SMOKE TEST: OK';
end;
$$;

rollback;
