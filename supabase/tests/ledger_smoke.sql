begin;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_wallet_a uuid;
  v_wallet_b uuid;
  v_settlement uuid;
  v_txn uuid;
  v_replayed boolean;
  v_bal bigint;
  v_count integer;
begin
  insert into auth.users (id, email)
  values (v_user_a, 'a@teste.local'), (v_user_b, 'b@teste.local');

  v_wallet_a := public.create_wallet(v_user_a, 'user_wallet', 'XOF');
  v_wallet_b := public.create_wallet(v_user_b, 'user_wallet', 'XOF');
  select id into v_settlement from public.accounts where type = 'settlement' and currency = 'XOF';

  -- deposito de 10000
  select out_transaction_id, out_replayed into v_txn, v_replayed
    from public.post_ledger_transfer(
      'teste-deposito-0001', 'deposit', v_settlement, v_wallet_a, 10000, 'XOF');
  if v_replayed then raise exception 'deposito nao devia ser replay'; end if;

  -- transferencia A -> B de 4000
  select out_transaction_id, out_replayed into v_txn, v_replayed
    from public.post_ledger_transfer(
      'teste-transf-0001', 'transfer', v_wallet_a, v_wallet_b, 4000, 'XOF', v_user_a);

  select balance into v_bal from public.accounts where id = v_wallet_a;
  if v_bal <> 6000 then raise exception 'saldo A esperado 6000, obtido %', v_bal; end if;
  select balance into v_bal from public.accounts where id = v_wallet_b;
  if v_bal <> 4000 then raise exception 'saldo B esperado 4000, obtido %', v_bal; end if;

  -- replay idempotente: mesmo resultado, sem novo movimento
  select out_transaction_id, out_replayed into v_txn, v_replayed
    from public.post_ledger_transfer(
      'teste-transf-0001', 'transfer', v_wallet_a, v_wallet_b, 4000, 'XOF', v_user_a);
  if not v_replayed then raise exception 'replay devia ser true'; end if;
  select balance into v_bal from public.accounts where id = v_wallet_a;
  if v_bal <> 6000 then raise exception 'replay alterou o saldo de A: %', v_bal; end if;

  -- mesma chave com valor diferente: NJ003
  begin
    perform public.post_ledger_transfer(
      'teste-transf-0001', 'transfer', v_wallet_a, v_wallet_b, 5000, 'XOF', v_user_a);
    raise exception 'esperava NJ003';
  exception when sqlstate 'NJ003' then null;
  end;

  -- saldo insuficiente: NJ004
  begin
    perform public.post_ledger_transfer(
      'teste-excesso-0001', 'transfer', v_wallet_a, v_wallet_b, 999999, 'XOF', v_user_a);
    raise exception 'esperava NJ004';
  exception when sqlstate 'NJ004' then null;
  end;

  -- imutabilidade: NJ006
  begin
    update public.ledger_entries set amount = 1;
    raise exception 'esperava NJ006';
  exception when sqlstate 'NJ006' then null;
  end;

  -- integridade global
  select count(*) into v_count from public.ledger_integrity_issues;
  if v_count <> 0 then raise exception 'problemas de integridade: %', v_count; end if;

  raise notice 'LEDGER SMOKE TEST: OK';
end;
$$;

rollback;
