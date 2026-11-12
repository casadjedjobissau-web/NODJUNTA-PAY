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
  v_fee_acc uuid;
  v_fee_start bigint;
  v_bal bigint;
  v_b_before bigint;
  v_id uuid;
  v_replayed boolean;
  v_req uuid;
  v_status text;
  v_count integer;
begin
  insert into auth.users (id, email)
  values (v_a, 'a@limites.local'), (v_b, 'b@limites.local'), (v_c, 'c@limites.local');

  v_wa := public.create_wallet(v_a, 'user_wallet', 'XOF');
  v_wb := public.create_wallet(v_b, 'user_wallet', 'XOF');
  v_wc := public.create_wallet(v_c, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');
  v_fee_acc := public.system_account_id('fee_revenue', 'XOF');
  select balance into v_fee_start from public.accounts where id = v_fee_acc;

  perform public.post_ledger_transfer('lim-dep-0001', 'deposit', v_settlement, v_wa, 100000, 'XOF');

  -- nivel 0: transferencia de 20000 (limite por operacao 25000) passa
  perform public.post_ledger_transfer('lim-t-0001', 'transfer', v_wa, v_wb, 20000, 'XOF', v_a);

  -- 30000 excede o limite por operacao: NJ011 e saldo intacto
  begin
    perform public.post_ledger_transfer('lim-t-0002', 'transfer', v_wa, v_wb, 30000, 'XOF', v_a);
    raise exception 'esperava NJ011 (por operacao)';
  exception when sqlstate 'NJ011' then null;
  end;
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 80000 then raise exception 'saldo A esperado 80000, obtido %', v_bal; end if;

  -- mais 25000 passa (consumo diario 45000)
  perform public.post_ledger_transfer('lim-t-0003', 'transfer', v_wa, v_wb, 25000, 'XOF', v_a);

  -- mais 10000 faria 55000 > 50000 (limite diario): NJ011
  begin
    perform public.post_ledger_transfer('lim-t-0004', 'transfer', v_wa, v_wb, 10000, 'XOF', v_a);
    raise exception 'esperava NJ011 (diario)';
  exception when sqlstate 'NJ011' then null;
  end;
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 55000 then raise exception 'saldo A esperado 55000, obtido %', v_bal; end if;

  -- nivel 0 nao pode levantar: NJ012 e nenhum pedido fica gravado
  begin
    perform public.create_withdrawal_request(v_a, 1000, 'XOF', 'sandbox', '+245955000099', 'lim-w-0001');
    raise exception 'esperava NJ012';
  exception when sqlstate 'NJ012' then null;
  end;
  select count(*) into v_count from public.payment_requests where user_id = v_a;
  if v_count <> 0 then raise exception 'nao devia existir pedido, obtido %', v_count; end if;

  -- sobe para o nivel 1
  update public.profiles set kyc_level = 1 where user_id = v_a;
  if not found then raise exception 'perfil de A devia existir'; end if;

  perform public.post_ledger_transfer('lim-t-0005', 'transfer', v_wa, v_wb, 30000, 'XOF', v_a);
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 25000 then raise exception 'saldo A esperado 25000, obtido %', v_bal; end if;

  -- tarifa: 100 fixos + 1% de 10000 = 200
  update public.fee_rules set flat_amount = 100, bps = 100 where operation = 'transfer';
  perform public.post_ledger_transfer('lim-t-0006', 'transfer', v_wa, v_wb, 10000, 'XOF', v_a);
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 14800 then raise exception 'saldo A esperado 14800, obtido %', v_bal; end if;
  select balance into v_bal from public.accounts where id = v_fee_acc;
  if v_bal - v_fee_start <> 200 then
    raise exception 'tarifa esperada 200, obtido %', v_bal - v_fee_start;
  end if;

  -- repeticao idempotente: nao cobra outra vez
  select out_transaction_id, out_replayed into v_id, v_replayed
    from public.post_ledger_transfer('lim-t-0006', 'transfer', v_wa, v_wb, 10000, 'XOF', v_a);
  if not v_replayed then raise exception 'replay devia ser true'; end if;
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 14800 then raise exception 'replay alterou saldo de A: %', v_bal; end if;
  select balance into v_bal from public.accounts where id = v_fee_acc;
  if v_bal - v_fee_start <> 200 then raise exception 'replay cobrou tarifa de novo'; end if;

  -- saldo nao chega para valor + tarifa: tudo e revertido (NJ004)
  insert into public.profiles (user_id, kyc_level) values (v_c, 1);
  perform public.post_ledger_transfer('lim-dep-0002', 'deposit', v_settlement, v_wc, 10000, 'XOF');
  select balance into v_b_before from public.accounts where id = v_wb;
  begin
    perform public.post_ledger_transfer('lim-t-0007', 'transfer', v_wc, v_wb, 10000, 'XOF', v_c);
    raise exception 'esperava NJ004 (valor + tarifa)';
  exception when sqlstate 'NJ004' then null;
  end;
  select balance into v_bal from public.accounts where id = v_wc;
  if v_bal <> 10000 then raise exception 'saldo C devia manter 10000, obtido %', v_bal; end if;
  select balance into v_bal from public.accounts where id = v_wb;
  if v_bal <> v_b_before then raise exception 'B nao devia ter recebido nada'; end if;

  -- levantamento com tarifa de 50: retem 1000 + 50; ao falhar, devolve tudo
  update public.fee_rules set flat_amount = 50 where operation = 'withdrawal';
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_withdrawal_request(v_a, 1000, 'XOF', 'sandbox', '+245955000099', 'lim-w-0002');
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 13750 then raise exception 'saldo A apos levantamento esperado 13750, obtido %', v_bal; end if;

  v_status := public.fail_payment_request(v_req, 'teste');
  select balance into v_bal from public.accounts where id = v_wa;
  if v_bal <> 14800 then raise exception 'saldo A apos falha esperado 14800, obtido %', v_bal; end if;
  select balance into v_bal from public.accounts where id = v_fee_acc;
  if v_bal - v_fee_start <> 200 then
    raise exception 'tarifa devia voltar a 200, obtido %', v_bal - v_fee_start;
  end if;

  select count(*) into v_count from public.ledger_integrity_issues;
  if v_count <> 0 then raise exception 'problemas de integridade: %', v_count; end if;

  raise notice 'LIMITS SMOKE TEST: OK';
end;
$$;

rollback;
