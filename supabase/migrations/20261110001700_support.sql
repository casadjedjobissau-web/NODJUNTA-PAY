-- Codigos de erro novos: NJ022 demasiados pedidos abertos, NJ023 pedido de suporte inexistente,
-- NJ024 pedido de suporte fechado, NJ025 mensagens de suporte sao imutaveis.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'transfer_received', 'payment_received', 'deposit_completed', 'deposit_failed',
  'withdrawal_completed', 'withdrawal_failed', 'kyc_approved', 'kyc_rejected',
  'merchant_active', 'merchant_suspended', 'security', 'system', 'support_reply'
));

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references auth.users (id) on delete restrict,
  category text not null check (category in (
    'account', 'payment', 'deposit_withdrawal', 'kyc', 'merchant', 'security', 'other'
  )),
  subject text not null check (char_length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'pending_user', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index support_tickets_user_idx on public.support_tickets (user_id, seq desc);
create index support_tickets_status_idx on public.support_tickets (status, last_message_at);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  ticket_id uuid not null references public.support_tickets (id) on delete restrict,
  author_type text not null check (author_type in ('user', 'admin')),
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index support_messages_ticket_idx on public.support_messages (ticket_id, seq);

create or replace function public.prevent_support_message_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Mensagens de suporte sao imutaveis' using errcode = 'NJ025';
end;
$$;

create trigger support_messages_no_mutation
  before update or delete on public.support_messages
  for each row execute function public.prevent_support_message_mutation();

create trigger support_messages_no_truncate
  before truncate on public.support_messages
  for each statement execute function public.prevent_support_message_mutation();

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy support_tickets_select_own on public.support_tickets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy support_messages_select_own on public.support_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
       where t.id = support_messages.ticket_id
         and t.user_id = (select auth.uid())
    )
  );

revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;

create or replace function public.create_support_ticket(
  p_user uuid,
  p_category text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_open integer;
  v_subject text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if p_user is null
     or p_category is null
     or p_category not in ('account', 'payment', 'deposit_withdrawal', 'kyc', 'merchant', 'security', 'other')
     or char_length(v_subject) not between 3 and 120
     or char_length(v_body) not between 1 and 2000 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  -- Serializa a criacao de pedidos do mesmo utilizador: o limite nao se contorna com pedidos paralelos.
  perform pg_advisory_xact_lock(hashtextextended('support:' || p_user::text, 0));

  select count(*) into v_open
    from public.support_tickets
   where user_id = p_user and status in ('open', 'pending_user');
  if v_open >= 5 then
    raise exception 'demasiados pedidos abertos' using errcode = 'NJ022';
  end if;

  insert into public.support_tickets (user_id, category, subject)
  values (p_user, p_category, v_subject)
  returning id into v_id;

  insert into public.support_messages (ticket_id, author_type, author_id, body)
  values (v_id, 'user', p_user, v_body);

  return v_id;
end;
$$;

create or replace function public.add_support_message(p_user uuid, p_ticket uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.support_tickets%rowtype;
  v_msg uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if p_user is null or p_ticket is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket and user_id = p_user for update;
  if not found then
    raise exception 'pedido de suporte inexistente' using errcode = 'NJ023';
  end if;
  if v_t.status = 'closed' then
    raise exception 'pedido de suporte fechado' using errcode = 'NJ024';
  end if;

  insert into public.support_messages (ticket_id, author_type, author_id, body)
  values (v_t.id, 'user', p_user, v_body)
  returning id into v_msg;

  update public.support_tickets set status = 'open', last_message_at = now() where id = v_t.id;
  return v_msg;
end;
$$;

create or replace function public.close_support_ticket(p_user uuid, p_ticket uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.support_tickets%rowtype;
begin
  if p_user is null or p_ticket is null then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket and user_id = p_user for update;
  if not found then
    raise exception 'pedido de suporte inexistente' using errcode = 'NJ023';
  end if;
  if v_t.status = 'closed' then
    return 'closed';
  end if;

  update public.support_tickets set status = 'closed' where id = v_t.id;
  return 'closed';
end;
$$;

create or replace function public.admin_support_reply(
  p_admin uuid,
  p_ticket uuid,
  p_body text,
  p_resolve boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.support_tickets%rowtype;
  v_msg uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if p_admin is null or p_ticket is null or p_resolve is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket for update;
  if not found then
    raise exception 'pedido de suporte inexistente' using errcode = 'NJ023';
  end if;
  if v_t.user_id = p_admin then
    raise exception 'nao pode tratar o proprio pedido' using errcode = 'NJ017';
  end if;
  if v_t.status = 'closed' then
    raise exception 'pedido de suporte fechado' using errcode = 'NJ024';
  end if;

  insert into public.support_messages (ticket_id, author_type, author_id, body)
  values (v_t.id, 'admin', p_admin, v_body)
  returning id into v_msg;

  update public.support_tickets
     set status = case when p_resolve then 'resolved' else 'pending_user' end,
         last_message_at = now()
   where id = v_t.id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_admin, 'admin', 'ADMIN_SUPPORT_REPLY', 'support_ticket', v_t.id::text,
          jsonb_build_object('resolved', p_resolve));

  begin
    perform public.create_notification(
      v_t.user_id, 'support_reply', 'Resposta do suporte',
      'O suporte respondeu ao seu pedido: ' || v_t.subject,
      jsonb_build_object('ticket_id', v_t.id)
    );
  exception when others then
    raise warning 'notificacao nao criada (suporte): %', sqlerrm;
  end;

  return v_msg;
end;
$$;

create or replace function public.admin_support_set_status(p_admin uuid, p_ticket uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.support_tickets%rowtype;
begin
  if p_admin is null or p_ticket is null or p_status is null
     or p_status not in ('open', 'resolved', 'closed') then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket for update;
  if not found then
    raise exception 'pedido de suporte inexistente' using errcode = 'NJ023';
  end if;
  if v_t.user_id = p_admin then
    raise exception 'nao pode tratar o proprio pedido' using errcode = 'NJ017';
  end if;
  if v_t.status = p_status then
    return p_status;
  end if;

  update public.support_tickets set status = p_status where id = v_t.id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_admin, 'admin', 'ADMIN_SUPPORT_STATUS', 'support_ticket', v_t.id::text,
          jsonb_build_object('from', v_t.status, 'to', p_status));

  return p_status;
end;
$$;

create or replace function public.admin_list_support_tickets(p_status text, p_limit integer)
returns table (
  id uuid,
  seq bigint,
  user_id uuid,
  phone text,
  full_name text,
  category text,
  subject text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select t.id, t.seq, t.user_id, u.phone::text, p.full_name, t.category, t.subject, t.status,
         t.created_at, t.last_message_at
    from public.support_tickets t
    join auth.users u on u.id = t.user_id
    left join public.profiles p on p.user_id = t.user_id
   where p_status is null or t.status = p_status
   order by case when t.status = 'open' then 0 else 1 end,
            case when t.status = 'open' then t.last_message_at end asc,
            t.last_message_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.admin_get_support_ticket(p_ticket uuid)
returns table (
  id uuid,
  seq bigint,
  user_id uuid,
  phone text,
  full_name text,
  category text,
  subject text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select t.id, t.seq, t.user_id, u.phone::text, p.full_name, t.category, t.subject, t.status,
         t.created_at, t.last_message_at
    from public.support_tickets t
    join auth.users u on u.id = t.user_id
    left join public.profiles p on p.user_id = t.user_id
   where t.id = p_ticket
$$;

revoke execute on function public.create_support_ticket(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.add_support_message(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.close_support_ticket(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_support_reply(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_support_set_status(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_list_support_tickets(text, integer) from public, anon, authenticated;
revoke execute on function public.admin_get_support_ticket(uuid) from public, anon, authenticated;

grant execute on function public.create_support_ticket(uuid, text, text, text) to service_role;
grant execute on function public.add_support_message(uuid, uuid, text) to service_role;
grant execute on function public.close_support_ticket(uuid, uuid) to service_role;
grant execute on function public.admin_support_reply(uuid, uuid, text, boolean) to service_role;
grant execute on function public.admin_support_set_status(uuid, uuid, text) to service_role;
grant execute on function public.admin_list_support_tickets(text, integer) to service_role;
grant execute on function public.admin_get_support_ticket(uuid) to service_role;
