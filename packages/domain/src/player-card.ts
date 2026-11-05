import { getEventConfig, type EventConfig } from "./events";
import { calculatePlayerStats, type PlayerStats } from "./stats";
import type { Match, MatchEvent, MatchEventType, PlayerId } from "./types";

export interface PlayerCardStats {
  results: PlayerStats;
  aciertos: number;
  fallos: number;
  espectaculo: number;
  signature: { event: EventConfig; count: number } | null;
}

/** Only count events belonging to this player's matches in the supplied period. */
export function calculatePlayerCardStats(
  playerId: PlayerId,
  matches: Match[],
  events: MatchEvent[],
): PlayerCardStats {
  const matchIds = new Set(
    matches
      .filter((match) => match.team1.includes(playerId) || match.team2.includes(playerId))
      .map((match) => match.id),
  );
  const counts = new Map<MatchEventType, number>();
  let aciertos = 0;
  let fallos = 0;
  let espectaculo = 0;

  for (const event of events) {
    if (event.playerId !== playerId || !matchIds.has(event.matchId)) continue;
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    const { sentiment } = getEventConfig(event.type);
    if (sentiment === "positive") aciertos++;
    else if (sentiment === "negative") fallos++;
    else espectaculo++;
  }

  // Resolve ties by event type so the signature is independent of fetch order.
  const top = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];

  return {
    results: calculatePlayerStats(playerId, matches),
    aciertos,
    fallos,
    espectaculo,
    signature: top ? { event: getEventConfig(top[0]), count: top[1] } : null,
  };
}
