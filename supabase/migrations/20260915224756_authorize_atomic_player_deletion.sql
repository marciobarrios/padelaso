-- Player deletion must go through this transaction so authorization is
-- checked before match history is rewritten. Direct table deletion would
-- leave player UUIDs behind in the matches.team1/team2 arrays.

drop policy if exists "Creator can delete player in group" on public.players;
revoke delete on table public.players from public, anon, authenticated;

create or replace function public.delete_player_atomic(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := (select auth.uid());
  target_group_id uuid;
  updated_match_count bigint;
  deleted_player_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Lock the player while checking both parts of the existing delete rule:
  -- the caller must be the creator and still belong to the player's group.
  select target_player.group_id
  into target_group_id
  from public.players as target_player
  where target_player.id = p_player_id
    and target_player.created_by = request_user_id
    and exists (
      select 1
      from public.group_members as membership
      where membership.group_id = target_player.group_id
        and membership.user_id = request_user_id
    )
  for update of target_player;

  if not found then
    raise exception 'Player deletion is not allowed' using errcode = '42501';
  end if;

  update public.matches as target_match
  set
    team1 = array_remove(target_match.team1, p_player_id),
    team2 = array_remove(target_match.team2, p_player_id)
  where target_match.group_id = target_group_id
    and (
      p_player_id = any(target_match.team1)
      or p_player_id = any(target_match.team2)
    );

  get diagnostics updated_match_count = row_count;

  -- Related match events and votes are removed by their foreign-key cascades.
  delete from public.players
  where id = p_player_id
  returning id into deleted_player_id;

  if not found then
    raise exception 'Player deletion did not complete' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'player_id', deleted_player_id,
    'updated_matches', updated_match_count
  );
end;
$$;

revoke all on function public.delete_player_atomic(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_player_atomic(uuid)
  to authenticated;
