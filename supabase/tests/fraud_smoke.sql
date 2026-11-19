begin;

do $$
declare
  v_u uuid := gen_random_uuid();
  v_v uuid := gen_random_uuid();
  v_w uuid := gen_random_uuid();
  v_x uuid := gen_random_uuid();
  v_adm uuid := gen_random_uuid();
  v_adm2 uuid := gen_random_uuid();
  v_wu uuid;
  v_wv uuid;
  v_settlement uuid;
  v_row record;
  v_n integer;
  v_text text;
  v_velocity_alert uuid;
  v_large_alert uuid;
  i integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_u, '245955000801', now()), (v_v, '245955000802', now()), (v_w, '245955000803', now()),
         (v_x, '245955000805', now()), (v_adm, '245955000806', now()), (v_adm2, '245955000807', now());
  insert into public.profiles (user_id, kyc_level, full_name) values (v_u, 1, 'Ana Gomes'), (v_v, 1, null);

  v_wu := public.create_wallet(v_u, 'user_wallet', 'XOF');
  v_wv := public.create_wallet(v_v, 'user_wallet', 'XOF');
  v_settlement := public.system_account_id('settlement', 'XOF');
  perform public.post_ledger_transfer('frd-dep-0001', 'deposit', v_settlement, v_wu, 100000, 'XOF');

  -- argumentos invalidos
  begin
    perform public.fraud_check(null, 'transfer', 1000);
    raise exception 'esperava NJ001 (utilizador)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.fraud_check(v_u, 'deposit', 1000);
    raise exception 'esperava NJ001 (operacao)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.fraud_check(v_u, 'transfer', 0);
    raise exception 'esperava NJ001 (valor)';
  exception when sqlstate 'NJ001' then null;
  end;

  -- uma operacao normal passa sem alertas
  select * into v_row from public.fraud_check(v_u, 'transfer', 1000);
  if v_row.out_decision <> 'allow' or v_row.out_rule is not null then raise exception 'esperava allow'; end if;
  select count(*) into v_n from public.fraud_alerts where user_id = v_u;
  if v_n <> 0 then raise exception 'nao devia haver alertas, obtido %', v_n; end if;

  -- montante elevado: sinaliza e permite; sem alertas duplicados em 10 minutos
  select * into v_row from public.fraud_check(v_u, 'transfer', 600000);
  if v_row.out_decision <> 'flag' or v_row.out_rule <> 'large_amount' then
    raise exception 'esperava flag/large_amount, obtido % %', v_row.out_decision, v_row.out_rule;
  end if;
  select * into v_row from public.fraud_check(v_u, 'transfer', 700000);
  if v_row.out_decision <> 'flag' then raise exception 'esperava flag outra vez'; end if;
  select count(*) into v_n from public.fraud_alerts where user_id = v_u and rule = 'large_amount';
  if v_n <> 1 then raise exception 'esperava 1 alerta de montante, obtido %', v_n; end if;
  select id into v_large_alert from public.fraud_alerts where user_id = v_u and rule = 'large_amount';

  -- velocidade: com o limite a 3, a quarta operacao e bloqueada
  update public.fraud_settings set value = 3 where key = 'velocity_max_ops';
  for i in 1..3 loop
    perform public.post_ledger_transfer('frd-t-000' || i, 'transfer', v_wu, v_wv, 1000, 'XOF', v_u);
  end loop;

  select * into v_row from public.fraud_check(v_u, 'transfer', 1000);
  if v_row.out_decision <> 'block' or v_row.out_rule <> 'velocity' then
    raise exception 'esperava block/velocity, obtido % %', v_row.out_decision, v_row.out_rule;
  end if;
  select * into v_row from public.fraud_check(v_u, 'withdrawal', 1000);
  if v_row.out_decision <> 'block' or v_row.out_rule <> 'velocity' then raise exception 'esperava block/velocity (levantamento)'; end if;
  select * into v_row from public.fraud_check(v_u, 'transfer', 600000);
  if v_row.out_decision <> 'block' or v_row.out_rule <> 'velocity' then raise exception 'o bloqueio devia ter prioridade sobre o montante'; end if;
  select count(*) into v_n from public.fraud_alerts where user_id = v_u and rule = 'velocity';
  if v_n <> 1 then raise exception 'esperava 1 alerta de velocidade, obtido %', v_n; end if;
  select id into v_velocity_alert from public.fraud_alerts where user_id = v_u and rule = 'velocity';

  -- outro utilizador nao e afetado
  select * into v_row from public.fraud_check(v_v, 'transfer', 1000);
  if v_row.out_decision <> 'allow' then raise exception 'o outro utilizador devia passar'; end if;

  -- limiar a zero desativa a regra de velocidade
  update public.fraud_settings set value = 0 where key = 'velocity_max_ops';
  select * into v_row from public.fraud_check(v_u, 'transfer', 1000);
  if v_row.out_decision <> 'allow' then raise exception 'sem velocidade devia passar'; end if;

  -- pausa nos levantamentos depois de trocar o PIN (definir o primeiro nao conta)
  perform public.pin_set_initial(v_w, 'hash-de-teste-com-mais-de-vinte-caracteres');
  select * into v_row from public.fraud_check(v_w, 'withdrawal', 1000);
  if v_row.out_decision <> 'allow' then raise exception 'definir o PIN nao devia bloquear'; end if;
  perform public.pin_replace(v_w, 'novo-hash-de-teste-com-mais-de-vinte-car');
  select * into v_row from public.fraud_check(v_w, 'withdrawal', 1000);
  if v_row.out_decision <> 'block' or v_row.out_rule <> 'cooldown' then
    raise exception 'esperava block/cooldown, obtido % %', v_row.out_decision, v_row.out_rule;
  end if;
  select * into v_row from public.fraud_check(v_w, 'transfer', 1000);
  if v_row.out_decision <> 'allow' then raise exception 'so os levantamentos ficam em pausa'; end if;
  select count(*) into v_n from public.fraud_alerts where user_id = v_w and rule = 'cooldown';
  if v_n <> 1 then raise exception 'esperava 1 alerta de pausa, obtido %', v_n; end if;

  -- horas a zero desativam a pausa
  update public.fraud_settings set value = 0 where key = 'withdrawal_cooldown_hours';
  select * into v_row from public.fraud_check(v_w, 'withdrawal', 1000);
  if v_row.out_decision <> 'allow' then raise exception 'sem pausa devia passar'; end if;
  update public.fraud_settings set value = 24 where key = 'withdrawal_cooldown_hours';

  -- pausa depois de trocar o numero; passadas as horas, deixa de bloquear
  insert into public.phone_change_requests
    (user_id, old_phone, new_phone, reason, evidence_note, status, created_by, decided_by, decided_at)
  values (v_x, '+245955000805', '+245955000899', 'Perdeu o cartao SIM',
          'Identidade verificada em videochamada.', 'approved', v_adm, v_adm2, now());
  select * into v_row from public.fraud_check(v_x, 'withdrawal', 1000);
  if v_row.out_decision <> 'block' or v_row.out_rule <> 'cooldown' then raise exception 'esperava pausa apos troca de numero'; end if;
  update public.phone_change_requests set decided_at = now() - interval '2 days' where user_id = v_x;
  select * into v_row from public.fraud_check(v_x, 'withdrawal', 1000);
  if v_row.out_decision <> 'allow' then raise exception 'passadas 48 horas devia passar'; end if;

  -- desligar o antifraude: tudo passa, mesmo com montante elevado
  update public.fraud_settings set value = 0 where key = 'fraud_enabled';
  select * into v_row from public.fraud_check(v_u, 'transfer', 900000);
  if v_row.out_decision <> 'allow' then raise exception 'antifraude desligado devia deixar passar'; end if;
  update public.fraud_settings set value = 1 where key = 'fraud_enabled';

  -- administracao: lista, nome, telefone escondido e filtros
  select count(*) into v_n from public.admin_list_fraud_alerts('open', 200) l where l.user_id = v_u;
  if v_n <> 2 then raise exception 'esperava 2 alertas abertos, obtido %', v_n; end if;
  select * into v_row from public.admin_list_fraud_alerts('open', 200) l where l.id = v_velocity_alert;
  if v_row.full_name <> 'Ana Gomes' or v_row.phone_masked <> '+245 955 *** 801' or v_row.rule <> 'velocity'
     or v_row.decision <> 'block' or v_row.operation <> 'transfer' or v_row.amount <> 1000
     or (v_row.details ->> 'max')::integer <> 3 then
    raise exception 'lista incorreta: % % % %', v_row.full_name, v_row.phone_masked, v_row.rule, v_row.details;
  end if;

  -- tratar um alerta: auditado, idempotente, e nao se trata o proprio
  v_text := public.admin_review_fraud_alert(v_adm, v_velocity_alert, '  Cliente contactado.  ');
  if v_text <> 'reviewed' then raise exception 'esperava reviewed, obtido %', v_text; end if;
  v_text := public.admin_review_fraud_alert(v_adm, v_velocity_alert, null);
  if v_text <> 'reviewed' then raise exception 'repeticao devia manter reviewed'; end if;
  select count(*) into v_n from public.audit_logs
   where action = 'ADMIN_FRAUD_REVIEW' and entity_id = v_velocity_alert::text;
  if v_n <> 1 then raise exception 'esperava 1 registo de auditoria, obtido %', v_n; end if;
  select * into v_row from public.fraud_alerts where id = v_velocity_alert;
  if v_row.status <> 'reviewed' or v_row.reviewed_by <> v_adm or v_row.review_note <> 'Cliente contactado.' then
    raise exception 'alerta tratado incorreto';
  end if;
  select count(*) into v_n from public.admin_list_fraud_alerts('open', 200) l where l.user_id = v_u;
  if v_n <> 1 then raise exception 'esperava 1 alerta aberto, obtido %', v_n; end if;
  select count(*) into v_n from public.admin_list_fraud_alerts('reviewed', 200) l where l.user_id = v_u;
  if v_n <> 1 then raise exception 'esperava 1 alerta tratado, obtido %', v_n; end if;

  begin
    perform public.admin_review_fraud_alert(v_u, v_large_alert, null);
    raise exception 'esperava NJ017';
  exception when sqlstate 'NJ017' then null;
  end;
  begin
    perform public.admin_review_fraud_alert(v_adm, gen_random_uuid(), null);
    raise exception 'esperava NJ034';
  exception when sqlstate 'NJ034' then null;
  end;
  begin
    perform public.admin_review_fraud_alert(v_adm, v_large_alert, repeat('x', 301));
    raise exception 'esperava NJ001 (nota)';
  exception when sqlstate 'NJ001' then null;
  end;

  select count(*) into v_n from public.ledger_integrity_issues;
  if v_n <> 0 then raise exception 'problemas de integridade: %', v_n; end if;

  raise notice 'FRAUD SMOKE TEST: OK';
end;
$$;

rollback;
