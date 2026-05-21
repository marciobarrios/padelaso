-- Open match management to all group members.
-- Previously, only the match creator could update/delete a match or its events,
-- and only point a score token at a match they created. Now any member of the
-- match's group can do all of these. The created_by column stays on the rows
-- for attribution; it just no longer gates access.

-- MATCHES UPDATE
drop policy if exists "Creator can update match in group" on public.matches;
create policy "Group members can update match"
  on public.matches for update
  to authenticated
  using (
    group_id in (select public.user_group_ids(auth.uid()))
  );

-- MATCHES DELETE
drop policy if exists "Creator can delete match in group" on public.matches;
create policy "Group members can delete match"
  on public.matches for delete
  to authenticated
  using (
    group_id in (select public.user_group_ids(auth.uid()))
  );

-- MATCH EVENTS DELETE
drop policy if exists "Creator can delete match events in group" on public.match_events;
create policy "Group members can delete match events"
  on public.match_events for delete
  to authenticated
  using (
    match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
    )
  );

-- SCORE TOKENS INSERT
-- Keep created_by = auth.uid() so one user can't mint a token row owned by
-- another user. Only the current_match_id constraint is broadened: any match
-- in a group the user belongs to is fair game.
drop policy if exists "Owner can insert own token" on public.score_tokens;
create policy "Owner can insert own token"
  on public.score_tokens for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      current_match_id is null
      or current_match_id in (
        select id from public.matches
        where group_id in (select public.user_group_ids(auth.uid()))
      )
    )
  );

-- SCORE TOKENS UPDATE
-- Same logic: created_by gate stays (one user, one token row), but the
-- current_match_id check expands to any match in the user's groups.
drop policy if exists "Owner can update own token" on public.score_tokens;
create policy "Owner can update own token"
  on public.score_tokens for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (
      current_match_id is null
      or current_match_id in (
        select id from public.matches
        where group_id in (select public.user_group_ids(auth.uid()))
      )
    )
  );
