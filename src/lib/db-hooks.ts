"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { MatchId, PlayerId } from "./types";

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

export function usePlayerMatches(playerId: PlayerId) {
  return (
    useLiveQuery(
      () =>
        db.matches
          .filter(
            (m) =>
              m.team1.includes(playerId) || m.team2.includes(playerId)
          )
          .toArray(),
      [playerId]
    ) ?? []
  );
}

export function usePlayerEvents(playerId: PlayerId) {
  return (
    useLiveQuery(
      () => db.matchEvents.where("playerId").equals(playerId).toArray(),
      [playerId]
    ) ?? []
  );
}
