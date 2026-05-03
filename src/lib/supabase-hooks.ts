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

// ---------- SWR key factory ----------

export const keys = {
  groups: () => ["groups"] as const,
  groupMembers: (groupId?: GroupId) =>
    ["group-members", groupId] as const,
  players: (groupId?: GroupId) => ["players", groupId] as const,
  matches: (groupId?: GroupId) => ["matches", groupId] as const,
  match: (matchId: MatchId) => ["match", matchId] as const,
  matchEvents: (matchId: MatchId) =>
    ["match-events", matchId] as const,
  matchVotes: (matchId: MatchId) =>
    ["match-votes", matchId] as const,
  allMatchEvents: (groupId?: GroupId) =>
    ["all-match-events", groupId] as const,
  allMatchVotes: (groupId?: GroupId) =>
    ["all-match-votes", groupId] as const,
  playerMatches: (playerId: string) =>
    ["player-matches", playerId] as const,
  playerEvents: (playerId: string) =>
    ["player-events", playerId] as const,
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

// ---------- Fetch helpers ----------

function getSupabase() {
  return getBrowserClient();
}

// ---------- Group hooks ----------

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
    keys.groupMembers(groupId),
    async () => {
      if (!groupId) return [];
      const { data } = await getSupabase()
        .from("group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("joined_at");
      return data?.map(mapGroupMember) ?? [];
    }
  );

  return data ?? [];
}

// ---------- Player/Match hooks (group-scoped) ----------

export function usePlayers(
  groupId?: GroupId,
  initialData?: Player[]
): { players: Player[]; loaded: boolean } {
  const { data, isLoading } = useSWR(
    keys.players(groupId),
    async () => {
      if (!groupId) return [];
      const { data } = await getSupabase()
        .from("players")
        .select("*")
        .eq("group_id", groupId)
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
    keys.matches(groupId),
    async () => {
      if (!groupId) return [];
      const { data } = await getSupabase()
        .from("matches")
        .select("*")
        .eq("group_id", groupId)
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
    keys.allMatchEvents(groupId),
    async () => {
      if (!groupId) return [];
      const { data } = await getSupabase()
        .from("match_events")
        .select(
          "id, match_id, player_id, type, created_by, created_at, matches!inner(group_id)"
        )
        .eq("matches.group_id", groupId);
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
    keys.allMatchVotes(groupId),
    async () => {
      if (!groupId) return [];
      const { data } = await getSupabase()
        .from("match_votes")
        .select(
          "id, match_id, voter_player_id, voted_for_player_id, vote_type, created_at, matches!inner(group_id)"
        )
        .eq("matches.group_id", groupId);
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

// ---------- Legacy compatibility ----------

/** @deprecated Use `invalidate(...)` with explicit keys instead. */
export function useDataRefresh() {
  return {
    refreshKey: 0,
    refresh: () => {
      // No-op: global refresh is replaced by targeted invalidation.
    },
  };
}
