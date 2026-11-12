begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_wallet uuid;
  v_req uuid;
  v_replayed boolean;
  v_out text;
  v_bal bigint;
  v_status text;
  v_bad integer;
begin
  insert into auth.users (id, email) values (v_user, 'u@webhooks.local');
  v_wallet := public.create_wallet(v_user, 'user_wallet', 'XOF');

  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_deposit_request(v_user, 5000, 'XOF', 'sandbox', 'whk-dep-0001');
  update public.payment_requests set provider_ref = 'ref-whk-1' where id = v_req;

  -- evento de conclusao credita 5000
  v_out := public.process_webhook_event('sandbox', 'evt-00000001', 'deposit.completed', 'ref-whk-1', '{}'::jsonb);
  if v_out <> 'processed' then raise exception 'esperava processed, obtido %', v_out; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 5000 then raise exception 'saldo esperado 5000, obtido %', v_bal; end if;

  -- o mesmo evento outra vez: duplicate, sem novo credito
  v_out := public.process_webhook_event('sandbox', 'evt-00000001', 'deposit.completed', 'ref-whk-1', '{}'::jsonb);
  if v_out <> 'duplicate' then raise exception 'esperava duplicate, obtido %', v_out; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 5000 then raise exception 'duplicado alterou o saldo: %', v_bal; end if;

  -- referencia desconhecida: ignored
  v_out := public.process_webhook_event('sandbox', 'evt-00000002', 'deposit.completed', 'ref-que-nao-existe', '{}'::jsonb);
  if v_out <> 'ignored' then raise exception 'esperava ignored, obtido %', v_out; end if;

  -- tipo de evento que nao corresponde ao pedido: ignored
  v_out := public.process_webhook_event('sandbox', 'evt-00000003', 'withdrawal.completed', 'ref-whk-1', '{}'::jsonb);
  if v_out <> 'ignored' then raise exception 'esperava ignored (tipo), obtido %', v_out; end if;

  -- evento de falha depois de concluido: failed, e o pedido continua completed
  v_out := public.process_webhook_event('sandbox', 'evt-00000004', 'deposit.failed', 'ref-whk-1', '{}'::jsonb);
  if v_out <> 'failed' then raise exception 'esperava failed, obtido %', v_out; end if;
  select status::text into v_status from public.payment_requests where id = v_req;
  if v_status <> 'completed' then raise exception 'pedido devia manter completed, obtido %', v_status; end if;
  select balance into v_bal from public.accounts where id = v_wallet;
  if v_bal <> 5000 then raise exception 'saldo devia manter 5000, obtido %', v_bal; end if;

  -- todos os eventos ficaram registados com o estado certo
  if (select count(*) from public.webhook_events where provider = 'sandbox') <> 4 then
    raise exception 'esperava 4 eventos registados';
  end if;

  -- argumento invalido: NJ001
  begin
    perform public.process_webhook_event('sandbox', 'curto', 'deposit.completed', 'ref', '{}'::jsonb);
    raise exception 'esperava NJ001';
  exception when sqlstate 'NJ001' then null;
  end;

  -- reconciliacao sem falhas
  select count(*) into v_bad from public.reconcile_report('XOF') where not ok;
  if v_bad <> 0 then raise exception 'reconciliacao com % falhas', v_bad; end if;

  raise notice 'WEBHOOKS SMOKE TEST: OK';
end;
$$;

rollback;
