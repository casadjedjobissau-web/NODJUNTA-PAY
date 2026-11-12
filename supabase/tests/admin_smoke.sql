begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_w_user uuid;
  v_w_other uuid;
  v_settlement uuid;
  v_code text;
  v_status text;
  v_row record;
  v_n integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_admin, '245955000101', now()),
         (v_user, '245955000102', now()),
         (v_other, '245955000103', now());
  insert into public.admin_users (user_id, role) values (v_admin, 'admin');

  v_w_user := public.create_wallet(v_user, 'user_wallet', 'XOF');
  v_w_other := public.create_wallet(v_other, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');
  perform public.post_ledger_transfer('adm-dep-0001', 'deposit', v_settlement, v_w_user, 10000, 'XOF');

  -- procura de utilizador
  select * into v_row from public.admin_lookup_user('+245955000102');
  if v_row.user_id is distinct from v_user then raise exception 'lookup devia encontrar o utilizador'; end if;
  if v_row.wallet_balance <> 10000 then raise exception 'saldo esperado 10000, obtido %', v_row.wallet_balance; end if;
  if v_row.kyc_level <> 0 then raise exception 'nivel esperado 0'; end if;

  select count(*) into v_n from public.admin_lookup_user('+245955999999');
  if v_n <> 0 then raise exception 'numero inexistente devia devolver 0 linhas'; end if;
  select count(*) into v_n from public.admin_lookup_user('abc');
  if v_n <> 0 then raise exception 'formato invalido devia devolver 0 linhas'; end if;

  -- comerciante: pendente, aparece nas listas e no resumo
  perform public.register_merchant(v_user, 'Loja Teste', 'XOF');
  select merchant_code into v_code from public.merchants where owner_id = v_user;

  select * into v_row from public.admin_overview();
  if v_row.pending_merchants < 1 then raise exception 'resumo devia mostrar comerciante pendente'; end if;

  select count(*) into v_n from public.admin_list_merchants('pending', 50) m where m.merchant_code = v_code;
  if v_n <> 1 then raise exception 'lista de pendentes devia ter o comerciante'; end if;

  -- ativar; repetir nao duplica a auditoria
  v_status := public.admin_set_merchant_status(v_admin, v_code, 'active');
  if v_status <> 'active' then raise exception 'esperava active, obtido %', v_status; end if;
  v_status := public.admin_set_merchant_status(v_admin, v_code, 'active');
  select count(*) into v_n from public.audit_logs where action = 'ADMIN_MERCHANT_STATUS' and entity_id = v_code;
  if v_n <> 1 then raise exception 'esperava 1 registo de auditoria, obtido %', v_n; end if;

  begin
    perform public.admin_set_merchant_status(v_admin, v_code, 'pending');
    raise exception 'esperava NJ001';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_set_merchant_status(v_admin, 'FFFFFFFF', 'active');
    raise exception 'esperava NJ018';
  exception when sqlstate 'NJ018' then null;
  end;

  -- congelar: sem motivo falha; a si proprio falha; com motivo bloqueia movimentos
  begin
    perform public.admin_set_wallet_frozen(v_admin, v_user, true, '  ');
    raise exception 'esperava NJ001 (motivo)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_set_wallet_frozen(v_admin, v_admin, true, 'teste');
    raise exception 'esperava NJ017';
  exception when sqlstate 'NJ017' then null;
  end;
  begin
    perform public.admin_set_wallet_frozen(v_admin, gen_random_uuid(), true, 'teste');
    raise exception 'esperava NJ018 (conta)';
  exception when sqlstate 'NJ018' then null;
  end;

  v_status := public.admin_set_wallet_frozen(v_admin, v_user, true, 'suspeita de fraude');
  if v_status <> 'frozen' then raise exception 'esperava frozen, obtido %', v_status; end if;

  begin
    perform public.post_ledger_transfer('adm-t-0001', 'transfer', v_w_user, v_w_other, 1000, 'XOF');
    raise exception 'esperava NJ002 (carteira congelada)';
  exception when sqlstate 'NJ002' then null;
  end;

  select * into v_row from public.admin_overview();
  if v_row.frozen_wallets < 1 then raise exception 'resumo devia mostrar carteiras congeladas'; end if;

  v_status := public.admin_set_wallet_frozen(v_admin, v_user, false, null);
  if v_status <> 'active' then raise exception 'esperava active, obtido %', v_status; end if;
  perform public.post_ledger_transfer('adm-t-0002', 'transfer', v_w_user, v_w_other, 1000, 'XOF');

  select count(*) into v_n from public.audit_logs where action = 'ADMIN_WALLET_FREEZE' and entity_id = v_user::text;
  if v_n <> 1 then raise exception 'esperava 1 registo de congelamento, obtido %', v_n; end if;
  select count(*) into v_n from public.audit_logs where action = 'ADMIN_WALLET_UNFREEZE' and entity_id = v_user::text;
  if v_n <> 1 then raise exception 'esperava 1 registo de descongelamento, obtido %', v_n; end if;

  -- lista de KYC pendentes
  perform public.submit_kyc_submission(public.create_kyc_submission(v_other, 1, 'id_card'), v_other);
  select count(*) into v_n from public.admin_list_kyc('pending', 50) k where k.user_id = v_other and k.phone like '%955000103';
  if v_n <> 1 then raise exception 'lista de KYC pendentes devia ter o pedido'; end if;

  select count(*) into v_n from public.ledger_integrity_issues;
  if v_n <> 0 then raise exception 'problemas de integridade: %', v_n; end if;

  raise notice 'ADMIN SMOKE TEST: OK';
end;
$$;

rollback;
