-- Codigos de erro novos: NJ013 nivel alvo invalido, NJ014 ja existe submissao aberta,
-- NJ015 estado invalido da submissao, NJ016 submissao inexistente, NJ017 revisor invalido.

create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  target_level smallint not null check (target_level between 1 and 3),
  document_type text not null check (document_type in ('id_card', 'passport', 'other')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  reviewer_id uuid references auth.users (id) on delete restrict,
  review_reason text check (review_reason is null or char_length(review_reason) <= 300),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index kyc_submissions_one_open_uq
  on public.kyc_submissions (user_id)
  where status in ('draft', 'pending');

create index kyc_submissions_user_idx on public.kyc_submissions (user_id, created_at desc);
create index kyc_submissions_status_idx on public.kyc_submissions (status, submitted_at);

create trigger kyc_submissions_set_updated_at
  before update on public.kyc_submissions
  for each row execute function public.set_updated_at();

-- Bucket PRIVADO. Sem politicas em storage.objects: so a service role (API) acede.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create or replace function public.create_kyc_submission(
  p_user_id uuid,
  p_target_level integer,
  p_document_type text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_level smallint;
  v_id uuid;
begin
  if p_user_id is null
     or p_target_level is null or p_target_level not between 1 and 3
     or p_document_type is null or p_document_type not in ('id_card', 'passport', 'other') then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;

  insert into public.profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select kyc_level into v_level from public.profiles where user_id = p_user_id for update;

  if p_target_level <= v_level then
    raise exception 'o nivel pedido tem de ser superior ao atual' using errcode = 'NJ013';
  end if;

  begin
    insert into public.kyc_submissions (user_id, target_level, document_type)
    values (p_user_id, p_target_level::smallint, p_document_type)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ja existe uma submissao aberta' using errcode = 'NJ014';
  end;

  return v_id;
end;
$$;

create or replace function public.submit_kyc_submission(
  p_submission_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.kyc_submissions%rowtype;
begin
  select * into v_sub
    from public.kyc_submissions
   where id = p_submission_id and user_id = p_user_id
     for update;
  if not found then
    raise exception 'submissao inexistente' using errcode = 'NJ016';
  end if;

  if v_sub.status = 'pending' then
    return 'pending';
  end if;
  if v_sub.status <> 'draft' then
    raise exception 'estado invalido: %', v_sub.status using errcode = 'NJ015';
  end if;

  update public.kyc_submissions
     set status = 'pending', submitted_at = now()
   where id = v_sub.id;

  return 'pending';
end;
$$;

create or replace function public.review_kyc_submission(
  p_submission_id uuid,
  p_reviewer uuid,
  p_approve boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.kyc_submissions%rowtype;
  v_status text;
begin
  if p_reviewer is null or p_approve is null then
    raise exception 'argumento invalido' using errcode = 'NJ001';
  end if;
  if not p_approve and (p_reason is null or char_length(trim(p_reason)) = 0) then
    raise exception 'a rejeicao exige um motivo' using errcode = 'NJ001';
  end if;

  select * into v_sub from public.kyc_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submissao inexistente' using errcode = 'NJ016';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'estado invalido: %', v_sub.status using errcode = 'NJ015';
  end if;
  if v_sub.user_id = p_reviewer then
    raise exception 'o revisor nao pode ser o proprio utilizador' using errcode = 'NJ017';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.kyc_submissions
     set status = v_status,
         reviewer_id = p_reviewer,
         review_reason = case when p_approve then null else left(trim(p_reason), 300) end,
         reviewed_at = now()
   where id = v_sub.id;

  if p_approve then
    update public.profiles
       set kyc_level = greatest(kyc_level, v_sub.target_level)
     where user_id = v_sub.user_id;
  end if;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (
    p_reviewer, 'admin', 'KYC_REVIEW', 'kyc_submission', v_sub.id::text,
    jsonb_build_object('approved', p_approve, 'target_level', v_sub.target_level)
  );

  return v_status;
end;
$$;

alter table public.kyc_submissions enable row level security;

create policy kyc_submissions_select_own on public.kyc_submissions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.kyc_submissions from anon, authenticated;
grant select on public.kyc_submissions to authenticated;

revoke execute on function public.create_kyc_submission(uuid, integer, text)
  from public, anon, authenticated;
revoke execute on function public.submit_kyc_submission(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.review_kyc_submission(uuid, uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.create_kyc_submission(uuid, integer, text) to service_role;
grant execute on function public.submit_kyc_submission(uuid, uuid) to service_role;
grant execute on function public.review_kyc_submission(uuid, uuid, boolean, text) to service_role;
