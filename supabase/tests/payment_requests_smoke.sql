begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_wallet uuid;
  v_settlement uuid;
  v_suspense uuid;
  v_settlement_start bigint;
  v_suspense_start bigint;
  v_req_dep uuid;
  v_req_wd1 uuid;
  v_req_wd2 uuid;
  v_id uuid;
  v_replayed boolean;
  v_status text;
  v_bal bigint;
  v_count integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_user, '245955000010', now());

  v_wallet := public.create_wallet(v_user, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');
  v_suspense := public.system_account_id('suspense', 'XOF');
  select balance into v_settlement_start from public.accounts where id = v_settlement;
  select balance into v_suspense_start from public.accounts where id = v_suspense;

  -- deposito: pedido pendente nao altera saldo
  select out_request_id, out_replayed into v_req_dep, v_replayed
    from public.create_deposit_request(v_user, 5000, 'XOF', 'sandbox', 'teste-dep-0001');
  if v_replayed then raise exception 'deposito novo nao devia ser replay'; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 0 then raise exception 'saldo antes da confirmacao devia ser 0, obtido %', v_bal; end if;

  -- replay idempotente
  select out_request_id, out_replayed into v_id, v_replayed
    from public.create_deposit_request(v_user, 5000, 'XOF', 'sandbox', 'teste-dep-0001');
  if not v_replayed or v_id <> v_req_dep then raise exception 'replay do deposito falhou'; end if;

  -- confirmacao credita 5000, e confirmar de novo nao duplica
  v_status := public.settle_payment_request(v_req_dep, 'ref-teste-1');
  if v_status <> 'completed' then raise exception 'estado esperado completed, obtido %', v_status; end if;
  v_status := public.settle_payment_request(v_req_dep, 'ref-teste-1');
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 5000 then raise exception 'saldo esperado 5000, obtido %', v_bal; end if;

  -- levantamento 1: retem 2000 de imediato
  select out_request_id, out_replayed into v_req_wd1, v_replayed
    from public.create_withdrawal_request(v_user, 2000, 'XOF', 'sandbox', '+245955000099', 'teste-wd-0001');
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 3000 then raise exception 'saldo apos retencao esperado 3000, obtido %', v_bal; end if;

  select out_request_id, out_replayed into v_id, v_replayed
    from public.create_withdrawal_request(v_user, 2000, 'XOF', 'sandbox', '+245955000099', 'teste-wd-0001');
  if not v_replayed or v_id <> v_req_wd1 then raise exception 'replay do levantamento falhou'; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 3000 then raise exception 'replay alterou o saldo: %', v_bal; end if;

  -- mesma chave com valor diferente: NJ003
  begin
    perform public.create_withdrawal_request(v_user, 2500, 'XOF', 'sandbox', '+245955000099', 'teste-wd-0001');
    raise exception 'esperava NJ003';
  exception when sqlstate 'NJ003' then null;
  end;

  -- conclusao do levantamento 1
  v_status := public.settle_payment_request(v_req_wd1);
  if v_status <> 'completed' then raise exception 'wd1 devia ficar completed'; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 3000 then raise exception 'saldo apos conclusao esperado 3000, obtido %', v_bal; end if;

  -- levantamento 2 falha: valor devolvido
  select out_request_id, out_replayed into v_req_wd2, v_replayed
    from public.create_withdrawal_request(v_user, 1000, 'XOF', 'sandbox', '+245955000099', 'teste-wd-0002');
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 2000 then raise exception 'saldo apos retencao 2 esperado 2000, obtido %', v_bal; end if;
  v_status := public.fail_payment_request(v_req_wd2, 'falha do provedor');
  if v_status <> 'failed' then raise exception 'wd2 devia ficar failed'; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 3000 then raise exception 'saldo apos devolucao esperado 3000, obtido %', v_bal; end if;

  -- falhar um pedido ja concluido: NJ009
  begin
    perform public.fail_payment_request(v_req_wd1, 'tentativa invalida');
    raise exception 'esperava NJ009';
  exception when sqlstate 'NJ009' then null;
  end;

  -- saldo insuficiente: NJ004 e nenhum pedido novo fica gravado
  begin
    perform public.create_withdrawal_request(v_user, 999999, 'XOF', 'sandbox', '+245955000099', 'teste-wd-0003');
    raise exception 'esperava NJ004';
  exception when sqlstate 'NJ004' then null;
  end;
  select count(*) into v_count from public.payment_requests where user_id = v_user;
  if v_count <> 3 then raise exception 'esperava 3 pedidos, obtido %', v_count; end if;

  -- contas de sistema: retencao liquida a zero; liquidacao -5000 + 2000
  select balance into v_bal from public.accounts where id = v_suspense;
  if v_bal - v_suspense_start <> 0 then raise exception 'conta de retencao devia ficar a zero'; end if;
  select balance into v_bal from public.accounts where id = v_settlement;
  if v_bal - v_settlement_start <> -3000 then
    raise exception 'liquidacao esperada -3000, obtido %', v_bal - v_settlement_start;
  end if;

  select count(*) into v_count from public.ledger_integrity_issues;
  if v_count <> 0 then raise exception 'problemas de integridade: %', v_count; end if;

  raise notice 'PAYMENT REQUESTS SMOKE TEST: OK';
end;
$$;

rollback;
