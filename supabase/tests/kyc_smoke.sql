begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_sub uuid;
  v_sub2 uuid;
  v_status text;
  v_level smallint;
  v_count integer;
begin
  insert into auth.users (id, email)
  values (v_user, 'u@kyc.local'), (v_reviewer, 'r@kyc.local');

  -- nivel invalido: NJ001
  begin
    perform public.create_kyc_submission(v_user, 0, 'passport');
    raise exception 'esperava NJ001';
  exception when sqlstate 'NJ001' then null;
  end;

  v_sub := public.create_kyc_submission(v_user, 1, 'id_card');

  -- segunda submissao aberta: NJ014
  begin
    perform public.create_kyc_submission(v_user, 2, 'passport');
    raise exception 'esperava NJ014';
  exception when sqlstate 'NJ014' then null;
  end;

  -- submeter e repetir (idempotente)
  v_status := public.submit_kyc_submission(v_sub, v_user);
  if v_status <> 'pending' then raise exception 'esperava pending, obtido %', v_status; end if;
  v_status := public.submit_kyc_submission(v_sub, v_user);
  if v_status <> 'pending' then raise exception 'repeticao devia manter pending'; end if;

  -- submissao de outro utilizador: NJ016
  begin
    perform public.submit_kyc_submission(v_sub, v_reviewer);
    raise exception 'esperava NJ016';
  exception when sqlstate 'NJ016' then null;
  end;

  -- o proprio utilizador nao pode rever: NJ017
  begin
    perform public.review_kyc_submission(v_sub, v_user, true, null);
    raise exception 'esperava NJ017';
  exception when sqlstate 'NJ017' then null;
  end;

  -- rejeicao sem motivo: NJ001
  begin
    perform public.review_kyc_submission(v_sub, v_reviewer, false, '   ');
    raise exception 'esperava NJ001';
  exception when sqlstate 'NJ001' then null;
  end;

  -- rejeicao com motivo: nivel mantem-se em 0
  v_status := public.review_kyc_submission(v_sub, v_reviewer, false, 'foto ilegivel');
  if v_status <> 'rejected' then raise exception 'esperava rejected, obtido %', v_status; end if;
  select kyc_level into v_level from public.profiles where user_id = v_user;
  if v_level <> 0 then raise exception 'nivel devia manter-se 0, obtido %', v_level; end if;

  -- rever de novo uma submissao ja decidida: NJ015
  begin
    perform public.review_kyc_submission(v_sub, v_reviewer, true, null);
    raise exception 'esperava NJ015';
  exception when sqlstate 'NJ015' then null;
  end;

  -- nova tentativa e aprovacao: nivel sobe para 1
  v_sub2 := public.create_kyc_submission(v_user, 1, 'id_card');
  perform public.submit_kyc_submission(v_sub2, v_user);
  v_status := public.review_kyc_submission(v_sub2, v_reviewer, true, null);
  if v_status <> 'approved' then raise exception 'esperava approved, obtido %', v_status; end if;
  select kyc_level into v_level from public.profiles where user_id = v_user;
  if v_level <> 1 then raise exception 'nivel devia ser 1, obtido %', v_level; end if;

  -- pedir um nivel que ja tem: NJ013
  begin
    perform public.create_kyc_submission(v_user, 1, 'passport');
    raise exception 'esperava NJ013';
  exception when sqlstate 'NJ013' then null;
  end;

  -- submissao inexistente: NJ016
  begin
    perform public.review_kyc_submission(gen_random_uuid(), v_reviewer, true, null);
    raise exception 'esperava NJ016 (inexistente)';
  exception when sqlstate 'NJ016' then null;
  end;

  -- duas revisoes em auditoria
  select count(*) into v_count
    from public.audit_logs
   where action = 'KYC_REVIEW' and actor_id = v_reviewer;
  if v_count <> 2 then raise exception 'esperava 2 registos de auditoria, obtido %', v_count; end if;

  -- o bucket existe e e privado
  select count(*) into v_count
    from storage.buckets
   where id = 'kyc-documents' and public = false;
  if v_count <> 1 then raise exception 'bucket kyc-documents em falta ou publico'; end if;

  raise notice 'KYC SMOKE TEST: OK';
end;
$$;

rollback;
