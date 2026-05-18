"use client";

import { SWRConfig, unstable_serialize } from "swr";
import { keys } from "./supabase-hooks";
import type { GroupId, Match, MatchEvent, MatchVote, Player } from "./types";

interface GroupDataHydratorProps {
  groupId: GroupId;
  matches?: Match[];
  players?: Player[];
  events?: MatchEvent[];
  votes?: MatchVote[];
  children: React.ReactNode;
}

// Hydrates SSR-prefetched group data into the SWR cache under the exact
// group-scoped keys, so the fallback only applies for the prefetched group.
// After a client-side group switch the new key has no fallback and SWR
// fetches fresh — avoiding a flash of the previous group's data.
export function GroupDataHydrator({
  groupId,
  matches,
  players,
  events,
  votes,
  children,
}: GroupDataHydratorProps) {
  const fallback: Record<string, unknown> = {};
  if (matches !== undefined)
    fallback[unstable_serialize(keys.matches(groupId))] = matches;
  if (players !== undefined)
    fallback[unstable_serialize(keys.players(groupId))] = players;
  if (events !== undefined)
    fallback[unstable_serialize(keys.allMatchEvents(groupId))] = events;
  if (votes !== undefined)
    fallback[unstable_serialize(keys.allMatchVotes(groupId))] = votes;
  return (
    <SWRConfig
      value={{
        fallback,
        revalidateOnFocus: false,
        revalidateIfStale: false,
        revalidateOnReconnect: false,
        dedupingInterval: 60_000,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
