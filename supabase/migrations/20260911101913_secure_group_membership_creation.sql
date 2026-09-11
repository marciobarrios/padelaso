-- Membership rows are created only by the group lifecycle RPCs below. The old
-- insert policy let any authenticated user join a known group and choose the
-- admin role for themselves.
drop policy if exists "Authenticated users can insert own membership"
  on public.group_members;

revoke insert on table public.group_members from public, anon, authenticated;

-- Both functions must bypass group/member RLS to perform their atomic writes,
-- so keep their surface narrow: authenticated callers only, an explicit user
-- check, fixed roles, and no caller-controlled search path objects.
create or replace function public.create_group(
  group_name text,
  group_emoji text,
  group_invite_code text
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := (select auth.uid());
  new_group public.groups;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.groups (name, emoji, invite_code, created_by)
  values (group_name, group_emoji, group_invite_code, request_user_id)
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role)
  values (new_group.id, request_user_id, 'admin');

  return new_group;
end;
$$;

create or replace function public.join_group_by_code(code text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := (select auth.uid());
  found_group public.groups;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select candidate_group.*
  into found_group
  from public.groups as candidate_group
  where candidate_group.invite_code = code;

  if not found then
    raise exception 'Grupo no encontrado' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (found_group.id, request_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  return found_group;
end;
$$;

revoke all on function public.create_group(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_group(text, text, text)
  to authenticated;

revoke all on function public.join_group_by_code(text)
  from public, anon, authenticated;
grant execute on function public.join_group_by_code(text)
  to authenticated;
