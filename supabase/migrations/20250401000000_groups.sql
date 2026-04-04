-- Padelaso: Groups / Clubs feature
-- New tables: groups, group_members
-- Altered tables: players, matches (add group_id)
-- New RPC: join_group_by_code
-- Data migration: create default groups for existing data

-- ============================================================
-- 1. CREATE TABLES (no policies yet — avoids cross-reference issue)
-- ============================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🏸',
  invite_code text unique not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now() not null
);

alter table public.groups enable row level security;

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member',
  joined_at timestamptz default now() not null,
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

-- ============================================================
-- 2. HELPER: check group membership (bypasses RLS for use in policies)
-- ============================================================

create or replace function public.user_group_ids(uid uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select group_id from public.group_members where user_id = uid;
$$;

create or replace function public.user_admin_group_ids(uid uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select group_id from public.group_members where user_id = uid and role = 'admin';
$$;

-- ============================================================
-- 3. RLS POLICIES FOR GROUPS (now group_members exists)
-- ============================================================

create policy "Group members can view group"
  on public.groups for select
  to authenticated
  using (
    id in (select public.user_group_ids(auth.uid()))
  );

create policy "Authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Group admins can update group"
  on public.groups for update
  to authenticated
  using (
    id in (
      select public.user_admin_group_ids(auth.uid())
    )
  );

create policy "Group admins can delete group"
  on public.groups for delete
  to authenticated
  using (
    id in (
      select public.user_admin_group_ids(auth.uid())
    )
  );

-- ============================================================
-- 3. RLS POLICIES FOR GROUP MEMBERS
-- ============================================================

create policy "Group members can view members"
  on public.group_members for select
  to authenticated
  using (
    group_id in (select public.user_group_ids(auth.uid()))
  );

create policy "Authenticated users can insert own membership"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own membership"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 4. ALTER PLAYERS & MATCHES: add group_id (nullable first)
-- ============================================================

alter table public.players add column group_id uuid references public.groups(id);
alter table public.matches add column group_id uuid references public.groups(id);

-- ============================================================
-- 5. RPC: create_group (SECURITY DEFINER to bypass RLS chicken-and-egg)
-- ============================================================

create or replace function public.create_group(
  group_name text,
  group_emoji text,
  group_invite_code text
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group public.groups;
begin
  insert into public.groups (name, emoji, invite_code, created_by)
  values (group_name, group_emoji, group_invite_code, auth.uid())
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role)
  values (new_group.id, auth.uid(), 'admin');

  return new_group;
end;
$$;

-- ============================================================
-- 6. RPC: join_group_by_code
-- ============================================================

create or replace function public.join_group_by_code(code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  found_group public.groups;
begin
  select * into found_group from public.groups where invite_code = code;

  if found_group is null then
    raise exception 'Grupo no encontrado' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (found_group.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return found_group;
end;
$$;

-- ============================================================
-- 7. HELPER: generate random invite code
-- ============================================================

create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

-- ============================================================
-- 7. DATA MIGRATION: create default groups for existing data
-- ============================================================

do $$
declare
  creator_id uuid;
  new_group_id uuid;
  new_code text;
begin
  for creator_id in
    select distinct created_by from (
      select created_by from public.players where created_by is not null
      union
      select created_by from public.matches where created_by is not null
    ) as creators
  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    insert into public.groups (name, emoji, invite_code, created_by)
    values ('Mi grupo', '🏸', new_code, creator_id)
    returning id into new_group_id;

    insert into public.group_members (group_id, user_id, role)
    values (new_group_id, creator_id, 'admin');

    update public.players
    set group_id = new_group_id
    where created_by = creator_id and group_id is null;

    update public.matches
    set group_id = new_group_id
    where created_by = creator_id and group_id is null;
  end loop;
end;
$$;

-- ============================================================
-- 8. Enforce NOT NULL on group_id
-- ============================================================

alter table public.players alter column group_id set not null;
alter table public.matches alter column group_id set not null;

-- ============================================================
-- 9. Update unique index on players: (user_id) → (user_id, group_id)
-- ============================================================

drop index if exists idx_players_user_id_unique;
create unique index idx_players_user_id_group_unique
  on public.players(user_id, group_id) where user_id is not null;

create index idx_players_group_id on public.players(group_id);
create index idx_matches_group_id on public.matches(group_id);

-- ============================================================
-- 10. UPDATE RLS POLICIES: scope existing tables by group
-- ============================================================

-- PLAYERS
drop policy if exists "Players are viewable by authenticated users" on public.players;
create policy "Players viewable by group members"
  on public.players for select
  to authenticated
  using (
    group_id in (select public.user_group_ids(auth.uid()))
  );

drop policy if exists "Authenticated users can create players" on public.players;
create policy "Group members can create players"
  on public.players for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and group_id in (select public.user_group_ids(auth.uid()))
  );

drop policy if exists "Creator or linked user can update player" on public.players;
create policy "Creator or linked user can update player in group"
  on public.players for update
  to authenticated
  using (
    group_id in (select public.user_group_ids(auth.uid()))
    and (
      created_by = auth.uid()
      or user_id = auth.uid()
      or (user_id is null)
    )
  );

drop policy if exists "Creator can delete player" on public.players;
create policy "Creator can delete player in group"
  on public.players for delete
  to authenticated
  using (
    created_by = auth.uid()
    and group_id in (select public.user_group_ids(auth.uid()))
  );

-- MATCHES
drop policy if exists "Matches visible to authenticated users" on public.matches;
create policy "Matches viewable by group members"
  on public.matches for select
  to authenticated
  using (
    group_id in (select public.user_group_ids(auth.uid()))
  );

drop policy if exists "Authenticated users can create matches" on public.matches;
create policy "Group members can create matches"
  on public.matches for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and group_id in (select public.user_group_ids(auth.uid()))
  );

drop policy if exists "Creator can update match" on public.matches;
create policy "Creator can update match in group"
  on public.matches for update
  to authenticated
  using (
    created_by = auth.uid()
    and group_id in (select public.user_group_ids(auth.uid()))
  );

drop policy if exists "Creator can delete match" on public.matches;
create policy "Creator can delete match in group"
  on public.matches for delete
  to authenticated
  using (
    created_by = auth.uid()
    and group_id in (select public.user_group_ids(auth.uid()))
  );

-- MATCH EVENTS
drop policy if exists "Match events visible to authenticated users" on public.match_events;
create policy "Match events viewable by group members"
  on public.match_events for select
  to authenticated
  using (
    match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
    )
  );

drop policy if exists "Authenticated users can create match events" on public.match_events;
create policy "Group members can create match events"
  on public.match_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
    )
  );

drop policy if exists "Creator can delete match events" on public.match_events;
create policy "Creator can delete match events in group"
  on public.match_events for delete
  to authenticated
  using (
    created_by = auth.uid()
    and match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
    )
  );
