import type { MatchSet, Player, PlayerId } from "./types";

export function getSetWins(sets: MatchSet[]) {
  let team1Wins = 0;
  let team2Wins = 0;
  for (const set of sets) {
    if (set.team1Score > set.team2Score) team1Wins++;
    else if (set.team2Score > set.team1Score) team2Wins++;
  }
  return { team1Wins, team2Wins };
}

export function buildPlayerMap(players: Player[]): Map<PlayerId, Player> {
  return new Map(players.map((player) => [player.id, player]));
}

export function applyScoreDelta(
  sets: MatchSet[],
  team: 1 | 2,
  delta: number,
): MatchSet[] {
  const base = sets.length ? sets : [{ team1Score: 0, team2Score: 0 }];
  const last = base.length - 1;
  const field = team === 1 ? "team1Score" : "team2Score";

  return base.map((set, index) =>
    index === last
      ? { ...set, [field]: Math.max(0, set[field] + delta) }
      : set,
  );
}
