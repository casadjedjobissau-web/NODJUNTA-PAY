begin;

do $$
declare
  v_u uuid := gen_random_uuid();
  v_o uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_t uuid;
  v_t2 uuid;
  v_row record;
  v_n integer;
  v_status text;
  v_i integer;
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_u, '245955000401', now()), (v_o, '245955000402', now()), (v_admin, '245955000403', now());
  insert into public.profiles (user_id, full_name) values (v_u, 'Ana Gomes');

  -- argumentos invalidos
  begin
    perform public.create_support_ticket(v_u, 'inexistente', 'Assunto valido', 'Mensagem');
    raise exception 'esperava NJ001 (categoria)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.create_support_ticket(v_u, 'payment', 'ab', 'Mensagem');
    raise exception 'esperava NJ001 (assunto)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.create_support_ticket(v_u, 'payment', 'Assunto valido', '   ');
    raise exception 'esperava NJ001 (mensagem)';
  exception when sqlstate 'NJ001' then null;
  end;

  -- criar um pedido: assunto aparado, primeira mensagem do utilizador
  v_t := public.create_support_ticket(v_u, 'payment', '  Pagamento em falta  ', 'O meu pagamento nao chegou.');
  select * into v_row from public.support_tickets where id = v_t;
  if v_row.status <> 'open' or v_row.subject <> 'Pagamento em falta' or v_row.category <> 'payment' then
    raise exception 'pedido incorreto: % % %', v_row.status, v_row.subject, v_row.category;
  end if;
  select count(*) into v_n from public.support_messages where ticket_id = v_t and author_type = 'user';
  if v_n <> 1 then raise exception 'esperava 1 mensagem do utilizador, obtido %', v_n; end if;

  -- pedido de outro utilizador: nao existe para quem nao e o dono
  begin
    perform public.add_support_message(v_o, v_t, 'ola');
    raise exception 'esperava NJ023 (mensagem)';
  exception when sqlstate 'NJ023' then null;
  end;
  begin
    perform public.close_support_ticket(v_o, v_t);
    raise exception 'esperava NJ023 (fechar)';
  exception when sqlstate 'NJ023' then null;
  end;

  -- resposta do utilizador mantem o pedido aberto
  perform public.add_support_message(v_u, v_t, 'Segue mais informacao.');
  select count(*) into v_n from public.support_messages where ticket_id = v_t;
  if v_n <> 2 then raise exception 'esperava 2 mensagens, obtido %', v_n; end if;

  -- o administrador nao trata os proprios pedidos
  v_t2 := public.create_support_ticket(v_admin, 'other', 'Pedido do administrador', 'Teste do administrador.');
  begin
    perform public.admin_support_reply(v_admin, v_t2, 'x', false);
    raise exception 'esperava NJ017 (resposta)';
  exception when sqlstate 'NJ017' then null;
  end;
  begin
    perform public.admin_support_set_status(v_admin, v_t2, 'resolved');
    raise exception 'esperava NJ017 (estado)';
  exception when sqlstate 'NJ017' then null;
  end;

  -- resposta do suporte sem resolver: aguarda o utilizador, notifica, audita
  perform public.admin_support_reply(v_admin, v_t, 'Estamos a verificar.', false);
  select * into v_row from public.support_tickets where id = v_t;
  if v_row.status <> 'pending_user' then raise exception 'esperava pending_user, obtido %', v_row.status; end if;
  select count(*) into v_n from public.notifications where user_id = v_u and kind = 'support_reply';
  if v_n <> 1 then raise exception 'esperava 1 notificacao, obtido %', v_n; end if;
  select count(*) into v_n from public.audit_logs
   where action = 'ADMIN_SUPPORT_REPLY' and entity_id = v_t::text and actor_id = v_admin;
  if v_n <> 1 then raise exception 'esperava 1 registo de auditoria, obtido %', v_n; end if;
  select count(*) into v_n from public.support_messages where ticket_id = v_t and author_type = 'admin';
  if v_n <> 1 then raise exception 'esperava 1 mensagem do suporte, obtido %', v_n; end if;

  -- o utilizador responde: volta a aberto
  perform public.add_support_message(v_u, v_t, 'Obrigado.');
  select * into v_row from public.support_tickets where id = v_t;
  if v_row.status <> 'open' then raise exception 'esperava open, obtido %', v_row.status; end if;

  -- o suporte resolve
  perform public.admin_support_reply(v_admin, v_t, 'Resolvido, o valor foi creditado.', true);
  select * into v_row from public.support_tickets where id = v_t;
  if v_row.status <> 'resolved' then raise exception 'esperava resolved, obtido %', v_row.status; end if;
  select count(*) into v_n from public.notifications where user_id = v_u and kind = 'support_reply';
  if v_n <> 2 then raise exception 'esperava 2 notificacoes, obtido %', v_n; end if;

  -- o utilizador reabre ao responder a um pedido resolvido
  perform public.add_support_message(v_u, v_t, 'Afinal ainda falta um valor.');
  select * into v_row from public.support_tickets where id = v_t;
  if v_row.status <> 'open' then raise exception 'devia reabrir, obtido %', v_row.status; end if;

  -- mudar o estado: repetir nao duplica a auditoria
  v_status := public.admin_support_set_status(v_admin, v_t, 'resolved');
  if v_status <> 'resolved' then raise exception 'esperava resolved, obtido %', v_status; end if;
  v_status := public.admin_support_set_status(v_admin, v_t, 'resolved');
  select count(*) into v_n from public.audit_logs
   where action = 'ADMIN_SUPPORT_STATUS' and entity_id = v_t::text;
  if v_n <> 1 then raise exception 'esperava 1 registo de estado, obtido %', v_n; end if;
  begin
    perform public.admin_support_set_status(v_admin, v_t, 'pending_user');
    raise exception 'esperava NJ001 (estado invalido)';
  exception when sqlstate 'NJ001' then null;
  end;
  begin
    perform public.admin_support_set_status(v_admin, gen_random_uuid(), 'closed');
    raise exception 'esperava NJ023 (estado)';
  exception when sqlstate 'NJ023' then null;
  end;

  -- detalhe do administrador: nome e telefone do utilizador
  select * into v_row from public.admin_get_support_ticket(v_t);
  if v_row.user_id <> v_u or v_row.full_name <> 'Ana Gomes' or v_row.phone not like '%955000401' then
    raise exception 'detalhe do administrador incorreto';
  end if;

  -- fechar: repetir e idempotente; depois nao aceita mensagens
  v_status := public.close_support_ticket(v_u, v_t);
  if v_status <> 'closed' then raise exception 'esperava closed, obtido %', v_status; end if;
  v_status := public.close_support_ticket(v_u, v_t);
  if v_status <> 'closed' then raise exception 'repeticao devia manter closed'; end if;
  begin
    perform public.add_support_message(v_u, v_t, 'Mais uma coisa.');
    raise exception 'esperava NJ024 (utilizador)';
  exception when sqlstate 'NJ024' then null;
  end;
  begin
    perform public.admin_support_reply(v_admin, v_t, 'Mais uma coisa.', false);
    raise exception 'esperava NJ024 (suporte)';
  exception when sqlstate 'NJ024' then null;
  end;
  begin
    perform public.admin_support_reply(v_admin, gen_random_uuid(), 'x', false);
    raise exception 'esperava NJ023 (resposta)';
  exception when sqlstate 'NJ023' then null;
  end;

  -- imutabilidade das mensagens
  begin
    update public.support_messages set body = 'alterada';
    raise exception 'esperava NJ025 (update)';
  exception when sqlstate 'NJ025' then null;
  end;
  begin
    delete from public.support_messages;
    raise exception 'esperava NJ025 (delete)';
  exception when sqlstate 'NJ025' then null;
  end;

  -- limite de 5 pedidos abertos; os resolvidos libertam espaco
  for v_i in 1..5 loop
    perform public.create_support_ticket(v_u, 'other', 'Pedido numero ' || v_i, 'Mensagem de teste.');
  end loop;
  begin
    perform public.create_support_ticket(v_u, 'other', 'Pedido a mais', 'Mensagem de teste.');
    raise exception 'esperava NJ022';
  exception when sqlstate 'NJ022' then null;
  end;
  select id into v_t2 from public.support_tickets where user_id = v_u and status = 'open' order by seq limit 1;
  perform public.admin_support_set_status(v_admin, v_t2, 'resolved');
  perform public.create_support_ticket(v_u, 'other', 'Pedido depois de resolver', 'Mensagem de teste.');

  -- lista do administrador: filtro por estado, nome e telefone
  select count(*) into v_n from public.admin_list_support_tickets('open', 200) l
   where l.user_id = v_u and l.full_name = 'Ana Gomes' and l.phone like '%955000401';
  if v_n <> 5 then raise exception 'esperava 5 abertos na lista, obtido %', v_n; end if;
  select count(*) into v_n from public.admin_list_support_tickets(null, 200) l where l.user_id = v_u;
  if v_n <> 7 then raise exception 'esperava 7 pedidos no total, obtido %', v_n; end if;
  select count(*) into v_n from public.admin_list_support_tickets('closed', 200) l where l.user_id = v_u;
  if v_n <> 1 then raise exception 'esperava 1 fechado, obtido %', v_n; end if;

  raise notice 'SUPPORT SMOKE TEST: OK';
end;
$$;

rollback;
