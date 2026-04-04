"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { MatchId } from "./types";

export function usePlayers() {
  return useLiveQuery(() => db.players.orderBy("name").toArray()) ?? [];
}

export function useMatches() {
  return useLiveQuery(() => db.matches.orderBy("date").reverse().toArray()) ?? [];
}

export function useMatch(id: MatchId) {
  return useLiveQuery(() => db.matches.get(id), [id]);
}

export function useMatchEvents(matchId: MatchId) {
  return (
    useLiveQuery(
      () => db.matchEvents.where("matchId").equals(matchId).toArray(),
      [matchId]
    ) ?? []
  );
}
