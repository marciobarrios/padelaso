-- Add missing UPDATE policy for match_votes
-- Required for upsert (change vote) to work through RLS
create policy "Voters can update own votes"
  on public.match_votes for update
  to authenticated
  using (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  )
  with check (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  );
