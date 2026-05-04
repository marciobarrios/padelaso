"use client";

import useSWR, { mutate } from "swr";
import { getBrowserClient } from "./supabase";
import {
  Player,
  Match,
  MatchEvent,
  MatchVote,
  MatchId,
  Group,
  GroupMember,
  GroupId,
} from "./types";
import {
  mapPlayer,
  mapMatch,
  mapMatchEvent,
  mapGroup,
  mapMatchVote,
  mapGroupMember,
} from "./mappers";
import {
  MATCH_EVENTS_GROUP_SELECT,
  MATCH_VOTES_GROUP_SELECT,
} from "./supabase-selects";

const KEY_PREFIXES = {
  groups: "groups",
  groupMembers: "group-members",
  players: "players",
  matches: "matches",
  match: "match",
  matchEvents: "match-events",
  matchVotes: "match-votes",
  allMatchEvents: "all-match-events",
  allMatchVotes: "all-match-votes",
  playerMatches: "player-matches",
  playerEvents: "player-events",
} as const;

type KeyName = keyof typeof KEY_PREFIXES;

const matchesPrefix =
  (name: KeyName) =>
  (key: unknown): boolean =>
    Array.isArray(key) && key[0] === KEY_PREFIXES[name];

export const keys = {
  groups: () => [KEY_PREFIXES.groups] as const,
  groupMembers: (groupId?: GroupId) =>
    [KEY_PREFIXES.groupMembers, groupId] as const,
  players: (groupId?: GroupId) => [KEY_PREFIXES.players, groupId] as const,
  matches: (groupId?: GroupId) => [KEY_PREFIXES.matches, groupId] as const,
  match: (matchId: MatchId) => [KEY_PREFIXES.match, matchId] as const,
  matchEvents: (matchId: MatchId) =>
    [KEY_PREFIXES.matchEvents, matchId] as const,
  matchVotes: (matchId: MatchId) =>
    [KEY_PREFIXES.matchVotes, matchId] as const,
  allMatchEvents: (groupId?: GroupId) =>
    [KEY_PREFIXES.allMatchEvents, groupId] as const,
  allMatchVotes: (groupId?: GroupId) =>
    [KEY_PREFIXES.allMatchVotes, groupId] as const,
  playerMatches: (playerId: string) =>
    [KEY_PREFIXES.playerMatches, playerId] as const,
  playerEvents: (playerId: string) =>
    [KEY_PREFIXES.playerEvents, playerId] as const,
};

/** Predicates for `invalidate()` that match every key in a family. */
export const matchAll = {
  players: matchesPrefix("players"),
  matches: matchesPrefix("matches"),
  matchEvents: matchesPrefix("matchEvents"),
  matchVotes: matchesPrefix("matchVotes"),
  allMatchEvents: matchesPrefix("allMatchEvents"),
  allMatchVotes: matchesPrefix("allMatchVotes"),
};

type SWRKey = readonly (string | undefined)[];

/** Revalidate one or more SWR keys. Pass exact keys or a predicate function. */
export function invalidate(
  ...keyPatterns: (SWRKey | ((key: unknown) => boolean))[]
) {
  for (const pattern of keyPatterns) {
    if (typeof pattern === "function") {
      mutate(pattern, undefined, { revalidate: true });
    } else {
      mutate(pattern);
    }
  }
}

function getSupabase() {
  return getBrowserClient();
}

export function useGroups(initialData?: Group[]): {
  groups: Group[];
  loaded: boolean;
} {
  const { data, isLoading } = useSWR(
    keys.groups(),
    async () => {
      const { data } = await getSupabase()
        .from("groups")
        .select("*")
        .order("created_at");
      return data?.map(mapGroup) ?? [];
    },
    { fallbackData: initialData }
  );

  return { groups: data ?? [], loaded: !isLoading };
}

export function useGroupMembers(groupId: GroupId | undefined): GroupMember[] {
  const { data } = useSWR(
    groupId ? keys.groupMembers(groupId) : null,
    async () => {
      const { data } = await getSupabase()
        .from("group_members")
        .select("*")
        .eq("group_id", groupId!)
        .order("joined_at");
      return data?.map(mapGroupMember) ?? [];
    }
  );

  return data ?? [];
}

export function usePlayers(
  groupId?: GroupId,
  initialData?: Player[]
): { players: Player[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    groupId ? keys.players(groupId) : null,
    async () => {
      const { data } = await getSupabase()
        .from("players")
        .select("*")
        .eq("group_id", groupId!)
        .order("name");
      return data?.map(mapPlayer) ?? [];
    },
    { fallbackData: initialData }
  );

  return { players: data ?? [], loaded: !isLoading };
}

export function useMatches(
  groupId?: GroupId,
  initialData?: Match[]
): { matches: Match[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    groupId ? keys.matches(groupId) : null,
    async () => {
      const { data } = await getSupabase()
        .from("matches")
        .select("*")
        .eq("group_id", groupId!)
        .order("created_at", { ascending: false });
      return data?.map(mapMatch) ?? [];
    },
    { fallbackData: initialData }
  );

  return { matches: data ?? [], loaded: !isLoading };
}

export function useMatch(
  id: MatchId,
  initialData?: Match
): {
  match: Match | undefined;
  loaded: boolean;
} {
  const { data, isLoading } = useSWR(
    keys.match(id),
    async () => {
      const { data } = await getSupabase()
        .from("matches")
        .select("*")
        .eq("id", id)
        .single();
      return data ? mapMatch(data) : undefined;
    },
    { fallbackData: initialData }
  );

  return { match: data, loaded: !isLoading };
}

export function useMatchEvents(
  matchId: MatchId,
  initialData?: MatchEvent[]
): {
  events: MatchEvent[];
  loaded: boolean;
} {
  const { data, isLoading } = useSWR(
    keys.matchEvents(matchId),
    async () => {
      const { data } = await getSupabase()
        .from("match_events")
        .select("*")
        .eq("match_id", matchId);
      return data?.map(mapMatchEvent) ?? [];
    },
    { fallbackData: initialData }
  );

  return { events: data ?? [], loaded: !isLoading };
}

export function useMatchVotes(
  matchId: MatchId,
  initialData?: MatchVote[]
): MatchVote[] {
  const { data } = useSWR(
    keys.matchVotes(matchId),
    async () => {
      const { data } = await getSupabase()
        .from("match_votes")
        .select("*")
        .eq("match_id", matchId);
      return data?.map(mapMatchVote) ?? [];
    },
    { fallbackData: initialData }
  );

  return data ?? [];
}

export function useAllMatchEvents(
  groupId?: GroupId,
  initialData?: MatchEvent[]
): { events: MatchEvent[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    groupId ? keys.allMatchEvents(groupId) : null,
    async () => {
      const { data } = await getSupabase()
        .from("match_events")
        .select(MATCH_EVENTS_GROUP_SELECT)
        .eq("matches.group_id", groupId!);
      return data?.map(mapMatchEvent) ?? [];
    },
    { fallbackData: initialData }
  );

  return { events: data ?? [], loaded: !isLoading };
}

export function useAllMatchVotes(
  groupId?: GroupId,
  initialData?: MatchVote[]
): { votes: MatchVote[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    groupId ? keys.allMatchVotes(groupId) : null,
    async () => {
      const { data } = await getSupabase()
        .from("match_votes")
        .select(MATCH_VOTES_GROUP_SELECT)
        .eq("matches.group_id", groupId!);
      return data?.map(mapMatchVote) ?? [];
    },
    { fallbackData: initialData }
  );

  return { votes: data ?? [], loaded: !isLoading };
}

export function usePlayerMatches(
  playerId: string,
  initialData?: Match[]
): { matches: Match[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    keys.playerMatches(playerId),
    async () => {
      const { data } = await getSupabase()
        .from("matches")
        .select("*")
        .or(`team1.cs.{${playerId}},team2.cs.{${playerId}}`)
        .order("created_at", { ascending: false });
      return data?.map(mapMatch) ?? [];
    },
    { fallbackData: initialData }
  );

  return { matches: data ?? [], loaded: !isLoading };
}

export function usePlayerEvents(
  playerId: string,
  initialData?: MatchEvent[]
): { events: MatchEvent[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    keys.playerEvents(playerId),
    async () => {
      const { data } = await getSupabase()
        .from("match_events")
        .select("*")
        .eq("player_id", playerId);
      return data?.map(mapMatchEvent) ?? [];
    },
    { fallbackData: initialData }
  );

  return { events: data ?? [], loaded: !isLoading };
}

