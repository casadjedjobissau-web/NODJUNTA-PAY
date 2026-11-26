begin;

do $$
declare
  v_list text;
  v_n integer;
  v_table text;
begin
  -- 1. Todas as tabelas do schema public tem RLS ligado.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if v_list is not null then
    raise exception 'tabelas sem RLS: %', v_list;
  end if;

  -- 2. O papel anon nao tem acesso nenhum a tabelas ou vistas do schema public.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if v_list is not null then
    raise exception 'anon tem acesso a: %', v_list;
  end if;

  -- 3. O papel authenticated nao escreve em nenhuma tabela ou vista: tudo passa pela API.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if v_list is not null then
    raise exception 'authenticated pode escrever em: %', v_list;
  end if;

  -- 4. Tabelas sensiveis que o authenticated nem sequer le.
  foreach v_table in array array[
    'user_pins', 'fraud_settings', 'fraud_alerts', 'phone_change_requests', 'account_deletions', 'admin_users'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'tabela em falta: %', v_table;
    end if;
    if has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'SELECT') then
      raise exception 'authenticated nao devia ler a tabela %', v_table;
    end if;
  end loop;

  -- 5. A API (service_role) continua a ter acesso ao que precisa.
  if not has_table_privilege('service_role', 'public.accounts', 'SELECT') then
    raise exception 'service_role perdeu o acesso a public.accounts';
  end if;

  -- 6. Funcoes SECURITY DEFINER: todas com search_path fixo.
  select string_agg(p.proname, ', ' order by p.proname)
    into v_list
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg where cfg like 'search_path=%'
     );
  if v_list is not null then
    raise exception 'funcoes SECURITY DEFINER sem search_path: %', v_list;
  end if;

  -- 7. Funcoes SECURITY DEFINER: nenhuma executavel por anon nem por authenticated.
  select string_agg(p.proname, ', ' order by p.proname)
    into v_list
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_list is not null then
    raise exception 'funcoes SECURITY DEFINER executaveis por anon ou authenticated: %', v_list;
  end if;

  -- 8. O bucket dos documentos de KYC existe e e privado.
  if not exists (select 1 from storage.buckets where id = 'kyc-documents') then
    raise exception 'o bucket kyc-documents nao existe';
  end if;
  if exists (select 1 from storage.buckets where id = 'kyc-documents' and public) then
    raise exception 'o bucket kyc-documents e publico';
  end if;

  -- 9. Nenhuma politica de leitura sobre os documentos de KYC: so a API os le, com links de 60 segundos.
  select count(*)
    into v_n
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and cmd in ('SELECT', 'ALL')
     and (coalesce(qual, '') like '%kyc-documents%' or coalesce(with_check, '') like '%kyc-documents%');
  if v_n <> 0 then
    raise exception 'ha % politicas de leitura sobre o bucket kyc-documents', v_n;
  end if;

  raise notice 'SECURITY SMOKE TEST: OK';
end;
$$;

rollback;
