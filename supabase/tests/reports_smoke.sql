begin;

do $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_u1 uuid := gen_random_uuid();
  v_u2 uuid := gen_random_uuid();
  v_u3 uuid := gen_random_uuid();
  v_w1 uuid;
  v_w3m uuid;
  v_settlement uuid;
  v_code text;
  v_req uuid;
  v_replayed boolean;
  v_before record;
  v_after record;
  v_sum_before record;
  v_sum_after record;
  v_m record;
  v_n integer;
  v_first date;
begin
  select * into v_before from public.admin_report_daily(v_today, v_today, 'XOF');
  select * into v_sum_before from public.admin_report_summary('XOF');

  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_u1, '245955000501', now()), (v_u2, '245955000502', now()), (v_u3, '245955000503', now());
  insert into public.profiles (user_id, kyc_level) values (v_u1, 1), (v_u2, 1), (v_u3, 1);

  v_w1 := public.create_wallet(v_u1, 'user_wallet', 'XOF');
  perform public.create_wallet(v_u2, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');

  -- credito direto no ledger: nao conta como deposito concluido nos relatorios
  perform public.post_ledger_transfer('rep-dep-0001', 'deposit', v_settlement, v_w1, 50000, 'XOF');

  update public.fee_rules set flat_amount = 100 where operation = 'transfer';
  update public.fee_rules set flat_amount = 50 where operation = 'withdrawal';

  perform public.post_ledger_transfer('rep-t-0001', 'transfer', v_w1,
    (select id from public.accounts where owner_id = v_u2 and type = 'user_wallet'), 4000, 'XOF', v_u1);
  perform public.post_ledger_transfer('rep-t-0002', 'transfer', v_w1,
    (select id from public.accounts where owner_id = v_u2 and type = 'user_wallet'), 3000, 'XOF', v_u1);

  -- pagamento a comerciante
  perform public.register_merchant(v_u3, 'Loja Relatorio', 'XOF');
  update public.merchants set status = 'active' where owner_id = v_u3;
  select merchant_code into v_code from public.merchants where owner_id = v_u3;
  select id into v_w3m from public.accounts where owner_id = v_u3 and type = 'merchant_wallet';
  perform public.post_ledger_transfer('rep-m-0001', 'merchant_payment', v_w1, v_w3m, 1500, 'XOF', v_u1, null,
    jsonb_build_object('merchant_code', v_code));

  -- deposito concluido (8000) e deposito pendente (3000)
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_deposit_request(v_u1, 8000, 'XOF', 'sandbox', 'rep-dr-0001');
  perform public.settle_payment_request(v_req);
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_deposit_request(v_u1, 3000, 'XOF', 'sandbox', 'rep-dr-0002');

  -- levantamento concluido (2000), falhado (1000, tarifa devolvida) e pendente (500)
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_withdrawal_request(v_u1, 2000, 'XOF', 'sandbox', '+245955000099', 'rep-wd-0001');
  perform public.settle_payment_request(v_req);
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_withdrawal_request(v_u1, 1000, 'XOF', 'sandbox', '+245955000099', 'rep-wd-0002');
  perform public.fail_payment_request(v_req, 'teste');
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_withdrawal_request(v_u1, 500, 'XOF', 'sandbox', '+245955000099', 'rep-wd-0003');

  select * into v_after from public.admin_report_daily(v_today, v_today, 'XOF');

  if v_after.transfers_count - v_before.transfers_count <> 2 then raise exception 'transferencias (contagem)'; end if;
  if v_after.transfers_volume - v_before.transfers_volume <> 7000 then raise exception 'transferencias (valor)'; end if;
  if v_after.payments_count - v_before.payments_count <> 1 then raise exception 'pagamentos (contagem)'; end if;
  if v_after.payments_volume - v_before.payments_volume <> 1500 then raise exception 'pagamentos (valor)'; end if;
  if v_after.deposits_count - v_before.deposits_count <> 1 then raise exception 'depositos (contagem)'; end if;
  if v_after.deposits_volume - v_before.deposits_volume <> 8000 then raise exception 'depositos (valor)'; end if;
  if v_after.withdrawals_count - v_before.withdrawals_count <> 1 then raise exception 'levantamentos (contagem)'; end if;
  if v_after.withdrawals_volume - v_before.withdrawals_volume <> 2000 then raise exception 'levantamentos (valor)'; end if;
  -- tarifas: 2 transferencias x 100 + levantamento concluido 50 + pendente 50; a do falhado foi devolvida
  if v_after.fees_net - v_before.fees_net <> 300 then
    raise exception 'tarifas liquidas esperadas 300, obtido %', v_after.fees_net - v_before.fees_net;
  end if;
  if v_after.new_users - v_before.new_users <> 3 then raise exception 'utilizadores novos'; end if;

  -- varios dias: uma linha por dia, ordenadas, os dias sem movimento a zero
  select count(*) into v_n from public.admin_report_daily(v_today - 2, v_today, 'XOF');
  if v_n <> 3 then raise exception 'esperava 3 dias, obtido %', v_n; end if;
  select min(d.day) into v_first from public.admin_report_daily(v_today - 2, v_today, 'XOF') d;
  if v_first <> v_today - 2 then raise exception 'primeiro dia incorreto'; end if;
  select count(*) into v_n from public.admin_report_daily(v_today - 2, v_today - 1, 'XOF') d
   where d.transfers_count <> 0 or d.fees_net <> 0 or d.new_users <> 0 or d.payments_count <> 0;
  if v_n <> 0 then raise exception 'os dias anteriores deviam estar a zero'; end if;

  -- resumo
  select * into v_sum_after from public.admin_report_summary('XOF');
  if v_sum_after.user_wallets - v_sum_before.user_wallets <> 2 then raise exception 'carteiras de clientes'; end if;
  if v_sum_after.merchant_wallets - v_sum_before.merchant_wallets <> 1 then raise exception 'carteiras de comerciantes'; end if;
  if v_sum_after.fee_balance - v_sum_before.fee_balance <> 300 then raise exception 'saldo de tarifas'; end if;
  if v_sum_after.pending_deposits_count - v_sum_before.pending_deposits_count <> 1 then raise exception 'depositos pendentes'; end if;
  if v_sum_after.pending_deposits_amount - v_sum_before.pending_deposits_amount <> 3000 then raise exception 'valor de depositos pendentes'; end if;
  if v_sum_after.pending_withdrawals_count - v_sum_before.pending_withdrawals_count <> 1 then raise exception 'levantamentos pendentes'; end if;
  if v_sum_after.pending_withdrawals_amount - v_sum_before.pending_withdrawals_amount <> 500 then raise exception 'valor de levantamentos pendentes'; end if;
  if v_sum_after.suspense_balance - v_sum_before.suspense_balance <> 500 then raise exception 'conta de retencao'; end if;
  if v_sum_after.ledger_gap <> 0 then raise exception 'o livro-razao devia somar 0, obtido %', v_sum_after.ledger_gap; end if;

  -- comerciantes: o comerciante do teste aparece com 1 pagamento de 1500
  select * into v_m from public.admin_report_merchants(v_today, v_today, 'XOF', 100) m where m.merchant_code = v_code;
  if v_m.payments_count <> 1 or v_m.payments_volume <> 1500 or v_m.business_name <> 'Loja Relatorio' then
    raise exception 'comerciante incorreto';
  end if;
  select count(*) into v_n from public.admin_report_merchants(v_today, v_today, 'XOF', 1);
  if v_n > 1 then raise exception 'o limite devia ser respeitado'; end if;

  -- argumentos invalidos
  begin
    perform public.admin_report_daily(v_today, v_today - 1, 'XOF');
    raise exception 'esperava NJ001 (intervalo invertido)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_report_daily(v_today - 93, v_today, 'XOF');
    raise exception 'esperava NJ001 (intervalo demasiado longo)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_report_daily(v_today, v_today, 'xof');
    raise exception 'esperava NJ001 (moeda)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_report_merchants(null, v_today, 'XOF', 10);
    raise exception 'esperava NJ001 (comerciantes)';
  exception when sqlstate 'NJ001' then null;
  end;

  raise notice 'REPORTS SMOKE TEST: OK';
end;
$$;

rollback;
