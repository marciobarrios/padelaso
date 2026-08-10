-- Planned match preparation
-- Adds first-class scheduled matches while preserving existing completed rows.

alter table public.matches
  add column status text not null default 'completed',
  add column scheduled_end_at timestamptz,
  add column confirmed_at timestamptz,
  add column confirmed_by uuid references auth.users on delete set null;

alter table public.matches
  add constraint matches_status_check
  check (status in ('completed', 'scheduled'));

alter table public.matches
  add constraint matches_schedule_check
  check (
    (status = 'completed')
    or (
      scheduled_end_at is not null
      and scheduled_end_at > date
    )
  );

create index idx_matches_group_status_date
  on public.matches(group_id, status, date);

-- Do not allow score tokens to target scheduled matches. The Shortcut URL can
-- only control completed/live rows.
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
          and status = 'completed'
      )
    )
  );

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
          and status = 'completed'
      )
    )
  );

-- Events and votes should only be created once a match has actually been
-- confirmed/completed.
drop policy if exists "Group members can create match events" on public.match_events;
create policy "Group members can create match events"
  on public.match_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
        and status = 'completed'
    )
  );

drop policy if exists "Linked players can cast votes" on public.match_votes;
create policy "Linked players can cast votes"
  on public.match_votes for insert
  to authenticated
  with check (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
    and match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
        and status = 'completed'
    )
  );

drop policy if exists "Voters can update own votes" on public.match_votes;
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
    and match_id in (
      select id from public.matches
      where group_id in (select public.user_group_ids(auth.uid()))
        and status = 'completed'
    )
  );

create or replace function public.can_confirm_scheduled_match(p_match_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.matches
    where id = p_match_id
      and status = 'scheduled'
      and date <= now() + interval '15 minutes'
      and group_id in (select public.user_group_ids(auth.uid()))
  );
$$;

grant execute on function public.can_confirm_scheduled_match(uuid) to authenticated;

create or replace function public.confirm_scheduled_match(
  p_match_id uuid,
  p_sets jsonb,
  p_events jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  match_row public.matches;
  event_row jsonb;
  event_player_id uuid;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) = 0 then
    raise exception 'sets must be a non-empty array' using errcode = '22023';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'events must be an array' using errcode = '22023';
  end if;

  select * into match_row
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'P0002';
  end if;

  if match_row.status <> 'scheduled' then
    raise exception 'match is not scheduled' using errcode = '22023';
  end if;

  if match_row.date > now() + interval '15 minutes' then
    raise exception 'match cannot be confirmed yet' using errcode = 'P0001';
  end if;

  update public.matches
  set
    status = 'completed',
    sets = p_sets,
    confirmed_at = now(),
    confirmed_by = auth.uid()
  where id = p_match_id;

  for event_row in select * from jsonb_array_elements(p_events)
  loop
    event_player_id := (event_row ->> 'playerId')::uuid;

    if not (event_player_id = any(match_row.team1) or event_player_id = any(match_row.team2)) then
      raise exception 'event player is not part of this match' using errcode = '22023';
    end if;

    insert into public.match_events (match_id, player_id, type, created_by)
    values (
      p_match_id,
      event_player_id,
      event_row ->> 'type',
      auth.uid()
    );
  end loop;

  return p_match_id;
end;
$$;

grant execute on function public.confirm_scheduled_match(uuid, jsonb, jsonb) to authenticated;

-- Scheduled matches cannot be mutated by live scoring.
create or replace function public.increment_match_score(
  p_match_id uuid,
  p_team int,
  p_delta int,
  p_new_set boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_sets jsonb;
  current_status text;
  last_index int;
  field text;
  current_val int;
  new_val int;
begin
  if p_team not in (1, 2) then
    raise exception 'team must be 1 or 2' using errcode = '22023';
  end if;

  select sets, status into current_sets, current_status
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'P0002';
  end if;

  if current_status = 'scheduled' then
    raise exception 'scheduled matches cannot be scored' using errcode = 'P0001';
  end if;

  if p_new_set then
    current_sets := coalesce(current_sets, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('team1Score', 0, 'team2Score', 0));
  end if;

  if current_sets is null or jsonb_array_length(current_sets) = 0 then
    current_sets := jsonb_build_array(
      jsonb_build_object('team1Score', 0, 'team2Score', 0)
    );
  end if;

  last_index := jsonb_array_length(current_sets) - 1;
  field := case when p_team = 1 then 'team1Score' else 'team2Score' end;
  current_val := coalesce((current_sets -> last_index ->> field)::int, 0);
  new_val := greatest(0, current_val + p_delta);

  current_sets := jsonb_set(
    current_sets,
    array[last_index::text, field],
    to_jsonb(new_val)
  );

  update public.matches set sets = current_sets where id = p_match_id;

  return current_sets;
end;
$$;

grant execute on function public.increment_match_score(uuid, int, int, boolean) to authenticated;
