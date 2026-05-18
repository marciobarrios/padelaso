import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "./supabase-admin";
import { mapMatch, mapPlayer, mapMatchEvent, mapMatchVote } from "./mappers";
import { getServerAuth } from "./server-auth";
import {
  MATCH_EVENTS_GROUP_SELECT,
  MATCH_VOTES_GROUP_SELECT,
} from "./supabase-selects";
import type {
  GroupId,
  Match,
  Player,
  MatchEvent,
  MatchVote,
  Group,
} from "./types";
import type { User } from "@supabase/supabase-js";

export interface GroupListData {
  groupId: GroupId;
  matches: Match[];
  players: Player[];
  events: MatchEvent[];
  votes: MatchVote[];
}

export const GROUP_DATA_TAG = (groupId: GroupId) => `group:${groupId}`;

// Service-role client (no cookies) is required because `use cache` forbids
// runtime APIs. Authorization is enforced by the uncached caller below — a
// user can only reach this with a `groupId` they're already a member of.
export async function fetchGroupListData(
  groupId: GroupId
): Promise<GroupListData> {
  "use cache";
  cacheLife("hours");
  cacheTag(GROUP_DATA_TAG(groupId));

  const supabase = createAdminSupabaseClient();

  const [
    { data: matchesData },
    { data: playersData },
    { data: eventsData },
    { data: votesData },
  ] = await Promise.all([
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
      .select(MATCH_EVENTS_GROUP_SELECT)
      .eq("matches.group_id", groupId),
    supabase
      .from("match_votes")
      .select(MATCH_VOTES_GROUP_SELECT)
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

export interface GroupContext {
  user: User;
  activeGroup: Group;
  data: GroupListData;
}

/**
 * Resolves the auth/active-group context for an authenticated page.
 * Redirects to /login or /groups/onboarding when the user can't see this page.
 *
 * Reads cookies (uncached). The expensive Supabase fan-out happens in
 * fetchGroupListData which is cached by `use cache` + cacheTag.
 */
export async function requireGroupContext(): Promise<GroupContext> {
  const { user, groups, activeGroupId } = await getServerAuth();
  if (!user) redirect("/login");
  if (groups.length === 0) redirect("/groups/onboarding");

  const activeGroup =
    groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const data = await fetchGroupListData(activeGroup.id);
  return { user, activeGroup, data };
}
