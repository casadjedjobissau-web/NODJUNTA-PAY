begin;

do $$
declare
  v_id bigint;
begin
  insert into public.audit_logs (actor_type, action)
  values ('system', 'TESTE')
  returning id into v_id;

  begin
    update public.audit_logs set action = 'ALTERADO' where id = v_id;
    raise exception 'esperava NJ008 no update';
  exception when sqlstate 'NJ008' then null;
  end;

  begin
    delete from public.audit_logs where id = v_id;
    raise exception 'esperava NJ008 no delete';
  exception when sqlstate 'NJ008' then null;
  end;

  raise notice 'AUDIT SMOKE TEST: OK';
end;
$$;

rollback;
