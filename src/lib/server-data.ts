import { cookies } from "next/headers";
import { createServerSupabaseClient } from "./supabase-server";
import { mapMatch, mapPlayer, mapMatchEvent, mapMatchVote } from "./mappers";
import { ACTIVE_GROUP_COOKIE } from "./active-group-cookie";
import type { GroupId, Match, Player, MatchEvent, MatchVote } from "./types";

export interface GroupListData {
  groupId: GroupId;
  matches: Match[];
  players: Player[];
  events: MatchEvent[];
  votes: MatchVote[];
}

export async function getActiveGroupId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_GROUP_COOKIE)?.value ?? null;
}

export async function fetchGroupListData(
  groupId: GroupId
): Promise<GroupListData> {
  const supabase = await createServerSupabaseClient();

  const [{ data: matchesData }, { data: playersData }, { data: eventsData }, { data: votesData }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false }),
      supabase
        .from("players")
        .select("*")
        .eq("group_id", groupId)
        .order("name"),
      supabase
        .from("match_events")
        .select(
          "id, match_id, player_id, type, created_by, created_at, matches!inner(group_id)"
        )
        .eq("matches.group_id", groupId),
      supabase
        .from("match_votes")
        .select(
          "id, match_id, voter_player_id, voted_for_player_id, vote_type, created_at, matches!inner(group_id)"
        )
        .eq("matches.group_id", groupId),
    ]);

  return {
    groupId,
    matches: matchesData?.map(mapMatch) ?? [],
    players: playersData?.map(mapPlayer) ?? [],
    events: eventsData?.map(mapMatchEvent) ?? [],
    votes: votesData?.map(mapMatchVote) ?? [],
  };
}
