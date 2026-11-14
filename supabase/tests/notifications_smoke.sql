begin;

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_wa uuid;
  v_wb uuid;
  v_wc uuid;
  v_settlement uuid;
  v_req uuid;
  v_replayed boolean;
  v_sub uuid;
  v_n integer;
  v_row record;
  v_ids uuid[];
  v_one uuid;
  v_state text;
  v_attempts integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_a, '245955000201', now()), (v_b, '245955000202', now()), (v_c, '245955000203', now());

  v_wa := public.create_wallet(v_a, 'user_wallet', 'XOF');
  v_wb := public.create_wallet(v_b, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');

  -- um deposito direto no ledger nao gera notificacao de "dinheiro recebido"
  perform public.post_ledger_transfer('ntf-dep-0001', 'deposit', v_settlement, v_wa, 50000, 'XOF');
  select count(*) into v_n from public.notifications where user_id = v_a;
  if v_n <> 0 then raise exception 'deposito no ledger nao devia notificar, obtido %', v_n; end if;

  -- transferencia A para B: so B e notificado, com o texto certo
  perform public.post_ledger_transfer('ntf-t-0001', 'transfer', v_wa, v_wb, 4000, 'XOF', v_a);
  select count(*) into v_n from public.notifications where user_id = v_b and kind = 'transfer_received';
  if v_n <> 1 then raise exception 'B devia ter 1 notificacao, obtido %', v_n; end if;
  select count(*) into v_n from public.notifications where user_id = v_a;
  if v_n <> 0 then raise exception 'A nao devia ser notificado, obtido %', v_n; end if;

  select * into v_row from public.notifications where user_id = v_b and kind = 'transfer_received';
  if v_row.title <> 'Dinheiro recebido' then raise exception 'titulo inesperado: %', v_row.title; end if;
  if v_row.body <> 'Recebeu 4' || chr(160) || '000' || chr(160) || 'XOF.' then
    raise exception 'texto inesperado: %', v_row.body;
  end if;
  if (v_row.data ->> 'amount')::bigint <> 4000 then raise exception 'dados inesperados'; end if;
  if v_row.read_at is not null or v_row.push_state <> 'pending' then raise exception 'estado inicial incorreto'; end if;

  -- repeticao idempotente e transferencia falhada nao criam mais notificacoes
  perform public.post_ledger_transfer('ntf-t-0001', 'transfer', v_wa, v_wb, 4000, 'XOF', v_a);
  begin
    perform public.post_ledger_transfer('ntf-t-0002', 'transfer', v_wa, v_wb, 999999, 'XOF', v_a);
    raise exception 'esperava NJ004';
  exception when sqlstate 'NJ004' then null;
  end;
  select count(*) into v_n from public.notifications where user_id = v_b;
  if v_n <> 1 then raise exception 'B devia continuar com 1, obtido %', v_n; end if;

  -- comerciante: ativado, paga-se-lhe, suspenso
  perform public.register_merchant(v_c, 'Loja Teste', 'XOF');
  select count(*) into v_n from public.notifications where user_id = v_c;
  if v_n <> 0 then raise exception 'registar nao devia notificar'; end if;

  update public.merchants set status = 'active' where owner_id = v_c;
  select count(*) into v_n from public.notifications where user_id = v_c and kind = 'merchant_active';
  if v_n <> 1 then raise exception 'esperava merchant_active, obtido %', v_n; end if;

  v_wc := public.create_wallet(v_c, 'merchant_wallet', 'XOF');
  perform public.post_ledger_transfer('ntf-m-0001', 'merchant_payment', v_wa, v_wc, 1000, 'XOF', v_a);
  select count(*) into v_n from public.notifications where user_id = v_c and kind = 'payment_received';
  if v_n <> 1 then raise exception 'esperava payment_received, obtido %', v_n; end if;

  update public.merchants set status = 'suspended' where owner_id = v_c;
  select count(*) into v_n from public.notifications where user_id = v_c and kind = 'merchant_suspended';
  if v_n <> 1 then raise exception 'esperava merchant_suspended, obtido %', v_n; end if;

  -- depositos: concluido e falhado
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_deposit_request(v_a, 5000, 'XOF', 'sandbox', 'ntf-dr-0001');
  perform public.settle_payment_request(v_req);
  select count(*) into v_n from public.notifications where user_id = v_a and kind = 'deposit_completed';
  if v_n <> 1 then raise exception 'esperava deposit_completed, obtido %', v_n; end if;

  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_deposit_request(v_a, 3000, 'XOF', 'sandbox', 'ntf-dr-0002');
  perform public.fail_payment_request(v_req, 'teste');
  select count(*) into v_n from public.notifications where user_id = v_a and kind = 'deposit_failed';
  if v_n <> 1 then raise exception 'esperava deposit_failed, obtido %', v_n; end if;

  -- KYC aprovado
  v_sub := public.create_kyc_submission(v_b, 1, 'id_card');
  perform public.submit_kyc_submission(v_sub, v_b);
  perform public.review_kyc_submission(v_sub, v_a, true, null);
  select count(*) into v_n from public.notifications where user_id = v_b and kind = 'kyc_approved';
  if v_n <> 1 then raise exception 'esperava kyc_approved, obtido %', v_n; end if;

  -- PIN: definir nao notifica; trocar notifica; reutilizar o mesmo hash nao notifica de novo
  perform public.pin_set_initial(v_b, 'hash-de-teste-com-mais-de-vinte-caracteres');
  select count(*) into v_n from public.notifications where user_id = v_b and kind = 'security';
  if v_n <> 0 then raise exception 'definir o PIN nao devia notificar'; end if;

  perform public.pin_replace(v_b, 'novo-hash-de-teste-com-mais-de-vinte-car');
  select count(*) into v_n from public.notifications where user_id = v_b and kind = 'security';
  if v_n <> 1 then raise exception 'trocar o PIN devia notificar, obtido %', v_n; end if;

  perform public.pin_confirm_success(v_b);
  perform public.pin_replace(v_b, 'novo-hash-de-teste-com-mais-de-vinte-car');
  select count(*) into v_n from public.notifications where user_id = v_b and kind = 'security';
  if v_n <> 1 then raise exception 'sem mudanca de hash nao devia notificar, obtido %', v_n; end if;

  -- ciclo de push
  select array_agg(id) into v_ids from public.notifications where user_id in (v_a, v_b, v_c);
  select count(*) into v_n from public.notifications where id = any (v_ids) and push_state <> 'pending';
  if v_n <> 0 then raise exception 'todas deviam estar pendentes'; end if;

  select count(*) into v_n from public.notifications_claim_for_push(500) c where c.out_id = any (v_ids);
  if v_n <> array_length(v_ids, 1) then
    raise exception 'esperava reclamar % notificacoes, obtido %', array_length(v_ids, 1), v_n;
  end if;
  select count(*) into v_n from public.notifications where id = any (v_ids) and push_state = 'sending';
  if v_n <> array_length(v_ids, 1) then raise exception 'todas deviam estar em sending'; end if;

  v_n := public.notifications_mark_push(v_ids, 'sent');
  if v_n <> array_length(v_ids, 1) then raise exception 'mark devia atualizar todas, obtido %', v_n; end if;

  select count(*) into v_n from public.notifications_claim_for_push(500) c where c.out_id = any (v_ids);
  if v_n <> 0 then raise exception 'notificacoes enviadas nao devem ser reclamadas outra vez'; end if;

  v_n := public.notifications_mark_push(v_ids, 'sent');
  if v_n <> 0 then raise exception 'mark so atua sobre linhas em sending, obtido %', v_n; end if;

  -- tentativas: failed volta a pending duas vezes e fica failed na terceira
  v_one := v_ids[1];
  update public.notifications set push_state = 'sending', push_attempts = 0 where id = v_one;
  perform public.notifications_mark_push(array[v_one], 'failed');
  select push_state, push_attempts into v_state, v_attempts from public.notifications where id = v_one;
  if v_state <> 'pending' or v_attempts <> 1 then raise exception 'tentativa 1: % %', v_state, v_attempts; end if;

  update public.notifications set push_state = 'sending' where id = v_one;
  perform public.notifications_mark_push(array[v_one], 'failed');
  select push_state, push_attempts into v_state, v_attempts from public.notifications where id = v_one;
  if v_state <> 'pending' or v_attempts <> 2 then raise exception 'tentativa 2: % %', v_state, v_attempts; end if;

  update public.notifications set push_state = 'sending' where id = v_one;
  perform public.notifications_mark_push(array[v_one], 'failed');
  select push_state, push_attempts into v_state, v_attempts from public.notifications where id = v_one;
  if v_state <> 'failed' or v_attempts <> 3 then raise exception 'tentativa 3: % %', v_state, v_attempts; end if;

  -- argumentos invalidos
  begin
    perform public.notifications_claim_for_push(0);
    raise exception 'esperava NJ001 (limite)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.notifications_mark_push(v_ids, 'inexistente');
    raise exception 'esperava NJ001 (estado)';
  exception when sqlstate 'NJ001' then null;
  end;

  raise notice 'NOTIFICATIONS SMOKE TEST: OK';
end;
$$;

rollback;
