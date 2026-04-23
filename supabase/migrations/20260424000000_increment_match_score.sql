-- Padelaso: atomic score increment
-- Previous implementation read matches.sets from JS, mutated it, and wrote
-- back — a classic read-modify-write that lost points under concurrency
-- (pinned scorer tap + Siri Shortcut firing at the same time).
--
-- This RPC takes a row-level lock via SELECT ... FOR UPDATE and computes the
-- new sets array entirely in Postgres. Two concurrent invocations serialize:
-- the second reads the first's committed result as its baseline.

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
  last_index int;
  field text;
  current_val int;
  new_val int;
begin
  if p_team not in (1, 2) then
    raise exception 'team must be 1 or 2' using errcode = '22023';
  end if;

  -- Row lock: serialize concurrent score writes against this match
  select sets into current_sets
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'P0002';
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
