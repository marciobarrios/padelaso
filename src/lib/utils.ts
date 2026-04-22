import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { MatchSet, Player, PlayerId } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getSetWins(sets: MatchSet[]) {
  let team1Wins = 0;
  let team2Wins = 0;
  for (const s of sets) {
    if (s.team1Score > s.team2Score) team1Wins++;
    else if (s.team2Score > s.team1Score) team2Wins++;
  }
  return { team1Wins, team2Wins };
}

export function buildPlayerMap(players: Player[]): Map<PlayerId, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

export function applyScoreDelta(
  sets: MatchSet[],
  team: 1 | 2,
  delta: number
): MatchSet[] {
  const base = sets.length ? sets : [{ team1Score: 0, team2Score: 0 }];
  const last = base.length - 1;
  const field = team === 1 ? "team1Score" : "team2Score";
  return base.map((s, i) =>
    i === last ? { ...s, [field]: Math.max(0, s[field] + delta) } : s
  );
}

export const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
