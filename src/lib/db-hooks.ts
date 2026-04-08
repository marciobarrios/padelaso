"use client";

// Re-export everything from the Supabase hooks layer
export {
  usePlayers,
  useMatches,
  useMatch,
  useMatchEvents,
  useMatchVotes,
  useAllMatchEvents,
  useAllMatchVotes,
  usePlayerMatches,
  usePlayerEvents,
  useDataRefresh,
  useGroups,
  useGroupMembers,
} from "./supabase-hooks";
