begin;

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_d uuid := gen_random_uuid();
  v_e uuid := gen_random_uuid();
  v_wa uuid;
  v_wb uuid;
  v_wd uuid;
  v_settlement uuid;
  v_code text;
  v_tx uuid;
  v_fee_tx uuid;
  v_req uuid;
  v_replayed boolean;
  v_hold_tx uuid;
  v_settle_tx uuid;
  v_rev_tx uuid;
  v_tx_created timestamptz;
  v_mine public.receipts%rowtype;
  v_theirs public.receipts%rowtype;
  v_again public.receipts%rowtype;
  v_n integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_a, '245955000301', now()), (v_b, '245955000302', now()), (v_c, '245955000303', now()),
         (v_d, '245955000304', now()), (v_e, '245955000305', now());
  insert into public.profiles (user_id, full_name, kyc_level)
  values (v_a, 'Ana Gomes', 1), (v_b, 'Bruno Sá', 0);

  v_wa := public.create_wallet(v_a, 'user_wallet', 'XOF');
  v_wb := public.create_wallet(v_b, 'user_wallet', 'XOF');
  v_wd := public.create_wallet(v_d, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');

  perform public.post_ledger_transfer('rcp-dep-0001', 'deposit', v_settlement, v_wa, 50000, 'XOF');
  update public.fee_rules set flat_amount = 100 where operation = 'transfer';

  -- transferencia A para B com tarifa de 100 e referencia
  select out_transaction_id into v_tx
    from public.post_ledger_transfer('rcp-t-0001', 'transfer', v_wa, v_wb, 4000, 'XOF', v_a, 'almoço');
  select created_at into v_tx_created from public.transactions where id = v_tx;

  select * into v_mine from public.get_or_create_receipt(v_a, v_tx);
  if v_mine.receipt_number !~ '^NP-[0-9]{6}-[0-9]{6}$' then raise exception 'numero invalido: %', v_mine.receipt_number; end if;
  if v_mine.direction <> 'out' or v_mine.kind <> 'transfer' then raise exception 'recibo de A incorreto'; end if;
  if v_mine.amount <> 4000 or v_mine.fee <> 100 or v_mine.currency <> 'XOF' then
    raise exception 'valores de A incorretos: % %', v_mine.amount, v_mine.fee;
  end if;
  if v_mine.counterparty_label <> 'Bruno Sá' or v_mine.counterparty_detail <> '+245 955 *** 302' then
    raise exception 'contraparte de A incorreta: % %', v_mine.counterparty_label, v_mine.counterparty_detail;
  end if;
  if v_mine.reference <> 'almoço' or v_mine.occurred_at <> v_tx_created then raise exception 'referencia ou data incorretas'; end if;

  select * into v_theirs from public.get_or_create_receipt(v_b, v_tx);
  if v_theirs.direction <> 'in' or v_theirs.fee <> 0 or v_theirs.amount <> 4000 then
    raise exception 'recibo de B incorreto';
  end if;
  if v_theirs.counterparty_label <> 'Ana Gomes' or v_theirs.counterparty_detail <> '+245 955 *** 301' then
    raise exception 'contraparte de B incorreta';
  end if;
  if v_theirs.receipt_number = v_mine.receipt_number then raise exception 'numeros devem ser diferentes'; end if;

  -- pedir outra vez devolve o mesmo recibo, sem criar outro
  select * into v_again from public.get_or_create_receipt(v_a, v_tx);
  if v_again.id <> v_mine.id or v_again.receipt_number <> v_mine.receipt_number then
    raise exception 'o recibo devia ser o mesmo';
  end if;
  select count(*) into v_n from public.receipts where transaction_id = v_tx;
  if v_n <> 2 then raise exception 'esperava 2 recibos, obtido %', v_n; end if;

  -- quem nao participou, transacao inexistente e a tarifa: nao ha recibo
  begin
    perform public.get_or_create_receipt(v_e, v_tx);
    raise exception 'esperava NJ021 (estranho)';
  exception when sqlstate 'NJ021' then null;
  end;
  begin
    perform public.get_or_create_receipt(v_a, gen_random_uuid());
    raise exception 'esperava NJ021 (inexistente)';
  exception when sqlstate 'NJ021' then null;
  end;
  select t.id into v_fee_tx from public.transactions t where t.idempotency_key = 'fee-' || v_tx::text;
  begin
    perform public.get_or_create_receipt(v_a, v_fee_tx);
    raise exception 'esperava NJ021 (tarifa)';
  exception when sqlstate 'NJ021' then null;
  end;
  begin
    perform public.get_or_create_receipt(null, v_tx);
    raise exception 'esperava NJ001';
  exception when sqlstate 'NJ001' then null;
  end;

  -- destinatario sem nome: "Utilizador"
  select out_transaction_id into v_tx
    from public.post_ledger_transfer('rcp-t-0002', 'transfer', v_wa, v_wd, 500, 'XOF', v_a);
  select * into v_mine from public.get_or_create_receipt(v_a, v_tx);
  if v_mine.counterparty_label <> 'Utilizador' or v_mine.counterparty_detail <> '+245 955 *** 304' then
    raise exception 'destinatario sem nome incorreto: % %', v_mine.counterparty_label, v_mine.counterparty_detail;
  end if;

  -- pagamento a comerciante
  perform public.register_merchant(v_c, 'Loja Teste', 'XOF');
  update public.merchants set status = 'active' where owner_id = v_c;
  select merchant_code into v_code from public.merchants where owner_id = v_c;
  select out_transaction_id into v_tx
    from public.post_ledger_transfer(
      'rcp-m-0001', 'merchant_payment', v_wa,
      (select id from public.accounts where owner_id = v_c and type = 'merchant_wallet'),
      1500, 'XOF', v_a, 'pão');

  select * into v_mine from public.get_or_create_receipt(v_a, v_tx);
  if v_mine.kind <> 'merchant_payment' or v_mine.direction <> 'out' or v_mine.fee <> 0 then
    raise exception 'recibo de pagamento incorreto';
  end if;
  if v_mine.counterparty_label <> 'Loja Teste' or v_mine.counterparty_detail <> v_code then
    raise exception 'comerciante incorreto: % %', v_mine.counterparty_label, v_mine.counterparty_detail;
  end if;
  select * into v_theirs from public.get_or_create_receipt(v_c, v_tx);
  if v_theirs.direction <> 'in' or v_theirs.counterparty_label <> 'Ana Gomes' then
    raise exception 'recibo do comerciante incorreto';
  end if;

  -- levantamento: o recibo e o da retencao, com o destino escondido
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_withdrawal_request(v_a, 2000, 'XOF', 'sandbox', '+245955000099', 'rcp-wd-0001');
  select hold_transaction_id into v_hold_tx from public.payment_requests where id = v_req;
  select * into v_mine from public.get_or_create_receipt(v_a, v_hold_tx);
  if v_mine.kind <> 'withdrawal' or v_mine.direction <> 'out' or v_mine.amount <> 2000 then
    raise exception 'recibo de levantamento incorreto';
  end if;
  if v_mine.counterparty_label <> 'Levantamento' or v_mine.counterparty_detail <> '+245 955 *** 099' then
    raise exception 'destino do levantamento incorreto: %', v_mine.counterparty_detail;
  end if;

  -- a liquidacao interna do levantamento nao tem recibo para o cliente
  perform public.settle_payment_request(v_req);
  select settle_transaction_id into v_settle_tx from public.payment_requests where id = v_req;
  begin
    perform public.get_or_create_receipt(v_a, v_settle_tx);
    raise exception 'esperava NJ021 (liquidacao interna)';
  exception when sqlstate 'NJ021' then null;
  end;

  -- devolucao de um levantamento falhado
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_withdrawal_request(v_a, 1000, 'XOF', 'sandbox', '+245955000099', 'rcp-wd-0002');
  perform public.fail_payment_request(v_req, 'teste');
  select t.id into v_rev_tx from public.transactions t where t.idempotency_key = 'wd-rev-' || v_req::text;
  select * into v_mine from public.get_or_create_receipt(v_a, v_rev_tx);
  if v_mine.kind <> 'reversal' or v_mine.direction <> 'in' or v_mine.counterparty_label <> 'Devolução' then
    raise exception 'recibo de devolucao incorreto';
  end if;

  -- deposito confirmado por pedido: o provedor aparece como detalhe
  select out_request_id, out_replayed into v_req, v_replayed
    from public.create_deposit_request(v_b, 7000, 'XOF', 'sandbox', 'rcp-dr-0001');
  perform public.settle_payment_request(v_req);
  select settle_transaction_id into v_settle_tx from public.payment_requests where id = v_req;
  select * into v_theirs from public.get_or_create_receipt(v_b, v_settle_tx);
  if v_theirs.kind <> 'deposit' or v_theirs.direction <> 'in' or v_theirs.counterparty_detail <> 'sandbox' then
    raise exception 'recibo de deposito incorreto: %', v_theirs.counterparty_detail;
  end if;

  -- todos os numeros emitidos sao diferentes
  select count(*) - count(distinct receipt_number) into v_n from public.receipts;
  if v_n <> 0 then raise exception 'numeros de recibo repetidos'; end if;

  -- mascara do telemovel
  if public.mask_phone('+245955000302') <> '+245 955 *** 302' then raise exception 'mascara GW incorreta'; end if;
  if public.mask_phone('245955000302') <> '+245 955 *** 302' then raise exception 'mascara sem + incorreta'; end if;
  if public.mask_phone('+351912345678') <> '***678' then raise exception 'mascara estrangeira incorreta'; end if;
  if public.mask_phone('123') is not null or public.mask_phone(null) is not null then
    raise exception 'mascara devia devolver null';
  end if;

  -- imutabilidade
  begin
    update public.receipts set amount = 1;
    raise exception 'esperava NJ020 (update)';
  exception when sqlstate 'NJ020' then null;
  end;
  begin
    delete from public.receipts;
    raise exception 'esperava NJ020 (delete)';
  exception when sqlstate 'NJ020' then null;
  end;

  select count(*) into v_n from public.ledger_integrity_issues;
  if v_n <> 0 then raise exception 'problemas de integridade: %', v_n; end if;

  raise notice 'RECEIPTS SMOKE TEST: OK';
end;
$$;

rollback;
