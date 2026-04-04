-- Padelaso: initial schema
-- Tables: profiles, players, matches, match_events
-- RLS enabled on all tables

-- ============================================================
-- PROFILES (created on first sign-in)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  player_id uuid,                -- link to a player record ("this is me")
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- ============================================================
-- PLAYERS
-- ============================================================
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '😎',
  user_id uuid references auth.users on delete set null,  -- linked Google account
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now() not null
);

alter table public.players enable row level security;

create policy "Players are viewable by authenticated users"
  on public.players for select
  to authenticated
  using (true);

create policy "Authenticated users can create players"
  on public.players for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Creator or linked user can update player"
  on public.players for update
  to authenticated
  using (created_by = auth.uid() or user_id = auth.uid());

create policy "Creator can delete player"
  on public.players for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- MATCHES
-- ============================================================
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  date timestamptz default now() not null,
  court_number int,
  team1 uuid[] not null,         -- array of 2 player IDs
  team2 uuid[] not null,         -- array of 2 player IDs
  sets jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now() not null
);

alter table public.matches enable row level security;

-- Visible if you created it OR a player linked to your account is a participant
create policy "Matches visible to creator or participants"
  on public.matches for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.players
      where players.user_id = auth.uid()
        and (players.id = any(team1) or players.id = any(team2))
    )
  );

create policy "Authenticated users can create matches"
  on public.matches for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Creator can update match"
  on public.matches for update
  to authenticated
  using (created_by = auth.uid());

create policy "Creator can delete match"
  on public.matches for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- MATCH EVENTS
-- ============================================================
create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  type text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now() not null
);

alter table public.match_events enable row level security;

-- Follow match visibility
create policy "Match events visible with match"
  on public.match_events for select
  to authenticated
  using (
    exists (
      select 1 from public.matches
      where matches.id = match_events.match_id
        and (
          matches.created_by = auth.uid()
          or exists (
            select 1 from public.players
            where players.user_id = auth.uid()
              and (players.id = any(matches.team1) or players.id = any(matches.team2))
          )
        )
    )
  );

create policy "Authenticated users can create match events"
  on public.match_events for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Creator can delete match events"
  on public.match_events for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- Add FK from profiles.player_id → players.id (deferred because players table must exist first)
-- ============================================================
alter table public.profiles
  add constraint profiles_player_id_fkey
  foreign key (player_id) references public.players(id) on delete set null;

-- ============================================================
-- Indexes for common queries
-- ============================================================
create index idx_players_user_id on public.players(user_id);
create index idx_players_created_by on public.players(created_by);
create index idx_matches_created_by on public.matches(created_by);
create index idx_matches_date on public.matches(date desc);
create index idx_match_events_match_id on public.match_events(match_id);
create index idx_match_events_player_id on public.match_events(player_id);
