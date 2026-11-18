-- Troca de numero de telefone: fluxo manual com dois administradores (quem pede nao decide).
-- Codigos de erro novos: NJ030 numero indisponivel, NJ031 pedido inexistente,
-- NJ032 estado invalido do pedido, NJ033 conta inelegivel.

create table public.phone_change_requests (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references auth.users (id) on delete restrict,
  old_phone text not null check (old_phone ~ '^\+[0-9]{8,15}$'),
  new_phone text not null check (new_phone ~ '^\+245[0-9]{9}$'),
  reason text not null check (char_length(reason) between 3 and 300),
  evidence_note text not null check (char_length(evidence_note) between 10 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null references auth.users (id) on delete restrict,
  decided_by uuid references auth.users (id) on delete restrict,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint phone_change_decided_check check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  ),
  constraint phone_change_different_check check (old_phone <> new_phone)
);

create unique index phone_change_one_pending_per_user_uq
  on public.phone_change_requests (user_id) where status = 'pending';
create unique index phone_change_one_pending_per_number_uq
  on public.phone_change_requests (new_phone) where status = 'pending';
create index phone_change_status_idx on public.phone_change_requests (status, seq desc);

alter table public.phone_change_requests enable row level security;
revoke all on public.phone_change_requests from anon, authenticated;

create or replace function public.admin_phone_change_create(
  p_admin uuid,
  p_user uuid,
  p_new_phone text,
  p_reason text,
  p_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid;
  v_old text;
  v_digits text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_evidence text := trim(coalesce(p_evidence, ''));
begin
  if p_admin is null or p_user is null
     or p_new_phone is null or p_new_phone !~ '^\+245[0-9]{9}$'
     or char_length(v_reason) not between 3 and 300
     or char_length(v_evidence) not between 10 and 500 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;
  if p_admin = p_user then
    raise exception 'nao pode alterar a propria conta' using errcode = 'NJ017';
  end if;

  -- Serializa os pedidos para o mesmo numero.
  perform pg_advisory_xact_lock(hashtextextended('phone-change:' || p_new_phone, 0));

  select case
           when u.phone is null then null
           when u.phone like '+%' then u.phone
           else '+' || u.phone
         end
    into v_old
    from auth.users u
   where u.id = p_user and u.deleted_at is null;
  if v_old is null then
    raise exception 'conta inelegivel' using errcode = 'NJ033';
  end if;

  if exists (select 1 from public.account_deletions where user_id = p_user)
     or exists (select 1 from public.admin_users where user_id = p_user and active) then
    raise exception 'conta inelegivel' using errcode = 'NJ033';
  end if;

  v_digits := substr(p_new_phone, 2);
  if p_new_phone = v_old
     or exists (
       select 1 from auth.users u
        where u.phone in (v_digits, p_new_phone) and u.deleted_at is null
     ) then
    raise exception 'numero indisponivel' using errcode = 'NJ030';
  end if;

  begin
    insert into public.phone_change_requests (user_id, old_phone, new_phone, reason, evidence_note, created_by)
    values (p_user, v_old, p_new_phone, v_reason, v_evidence, p_admin)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ja existe um pedido pendente' using errcode = 'NJ032';
  end;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_admin, 'admin', 'ADMIN_PHONE_CHANGE_REQUEST', 'phone_change', v_id::text,
          jsonb_build_object('user_id', p_user));

  return v_id;
end;
$$;

create or replace function public.admin_phone_change_decide(
  p_admin uuid,
  p_request uuid,
  p_approve boolean,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_r public.phone_change_requests%rowtype;
  v_digits text;
  v_status text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if p_admin is null or p_request is null or p_approve is null
     or char_length(v_reason) > 300
     or (not p_approve and char_length(v_reason) = 0) then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_r from public.phone_change_requests where id = p_request for update;
  if not found then
    raise exception 'pedido inexistente' using errcode = 'NJ031';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'o pedido ja foi decidido' using errcode = 'NJ032';
  end if;
  -- Dois administradores: quem pediu nao decide, e o proprio utilizador tambem nao.
  if p_admin = v_r.created_by or p_admin = v_r.user_id then
    raise exception 'o mesmo administrador nao pode pedir e decidir' using errcode = 'NJ017';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  if p_approve then
    perform pg_advisory_xact_lock(hashtextextended('phone-change:' || v_r.new_phone, 0));
    v_digits := substr(v_r.new_phone, 2);

    -- A conta e o numero sao verificados outra vez no momento de aprovar.
    if not exists (select 1 from auth.users u where u.id = v_r.user_id and u.deleted_at is null)
       or exists (select 1 from public.account_deletions where user_id = v_r.user_id)
       or exists (select 1 from public.admin_users where user_id = v_r.user_id and active) then
      raise exception 'conta inelegivel' using errcode = 'NJ033';
    end if;
    if exists (
      select 1 from auth.users u
       where u.phone in (v_digits, v_r.new_phone)
         and u.deleted_at is null
         and u.id <> v_r.user_id
    ) then
      raise exception 'numero indisponivel' using errcode = 'NJ030';
    end if;

    update auth.users
       set phone = v_digits, phone_confirmed_at = now()
     where id = v_r.user_id;

    update auth.identities
       set provider_id = v_digits,
           identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{phone}', to_jsonb(v_digits))
     where user_id = v_r.user_id and provider = 'phone';

    -- As sessoes antigas deixam de valer: e preciso entrar de novo com o numero novo.
    delete from auth.sessions where user_id = v_r.user_id;
  end if;

  update public.phone_change_requests
     set status = v_status,
         decided_by = p_admin,
         decided_at = now(),
         decision_reason = nullif(v_reason, '')
   where id = v_r.id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_admin, 'admin', 'ADMIN_PHONE_CHANGE_DECIDE', 'phone_change', v_r.id::text,
          jsonb_build_object('approved', p_approve, 'user_id', v_r.user_id));

  if p_approve then
    begin
      perform public.create_notification(
        v_r.user_id, 'security', 'Número alterado',
        'O número da sua conta foi alterado. Se não pediu esta alteração, contacte o suporte de imediato.',
        '{}'::jsonb
      );
    exception when others then
      raise warning 'notificacao nao criada (troca de numero): %', sqlerrm;
    end;
  end if;

  return v_status;
end;
$$;

create or replace function public.admin_list_phone_changes(p_status text, p_limit integer)
returns table (
  id uuid,
  seq bigint,
  user_id uuid,
  full_name text,
  old_phone_masked text,
  new_phone text,
  reason text,
  evidence_note text,
  status text,
  created_by uuid,
  decided_by uuid,
  decision_reason text,
  created_at timestamptz,
  decided_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select r.id, r.seq, r.user_id, p.full_name, public.mask_phone(r.old_phone), r.new_phone,
         r.reason, r.evidence_note, r.status, r.created_by, r.decided_by, r.decision_reason,
         r.created_at, r.decided_at
    from public.phone_change_requests r
    left join public.profiles p on p.user_id = r.user_id
   where p_status is null or r.status = p_status
   order by case when r.status = 'pending' then 0 else 1 end, r.seq desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke execute on function public.admin_phone_change_create(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.admin_phone_change_decide(uuid, uuid, boolean, text)
  from public, anon, authenticated;
revoke execute on function public.admin_list_phone_changes(text, integer)
  from public, anon, authenticated;

grant execute on function public.admin_phone_change_create(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_phone_change_decide(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_list_phone_changes(text, integer) to service_role;
