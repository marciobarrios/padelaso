-- =============================================================
-- Match Votes: democratic MVP & awards voting system
-- =============================================================

-- 1a. Clean up match events: move "mvp" to vote system, rename "mejor_salvada"
delete from public.match_events where type = 'mvp';
update public.match_events set type = 'salvada_top' where type = 'mejor_salvada';

-- 1b. Create match_votes table
create table public.match_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  voter_player_id uuid not null references public.players(id) on delete cascade,
  voted_for_player_id uuid not null references public.players(id) on delete cascade,
  vote_type text not null,
  created_at timestamptz default now() not null,
  constraint match_votes_unique unique (match_id, voter_player_id, vote_type)
);

-- Indexes for common queries
create index match_votes_match_id_idx on public.match_votes(match_id);
create index match_votes_voted_for_idx on public.match_votes(voted_for_player_id);

-- Enable RLS
alter table public.match_votes enable row level security;

-- SELECT: group members can view votes (via match → group membership)
create policy "Group members can view match votes"
  on public.match_votes for select
  to authenticated
  using (
    match_id in (
      select id from public.matches where group_id in (select public.user_group_ids(auth.uid()))
    )
  );

-- INSERT: authenticated user whose player is voter_player_id
create policy "Linked players can cast votes"
  on public.match_votes for insert
  to authenticated
  with check (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
    and match_id in (
      select id from public.matches where group_id in (select public.user_group_ids(auth.uid()))
    )
  );

-- DELETE: voter can retract their own vote
create policy "Voters can retract own votes"
  on public.match_votes for delete
  to authenticated
  using (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  );
