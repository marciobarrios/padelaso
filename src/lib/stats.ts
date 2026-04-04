import { Match, MatchEvent, Player, PlayerId, MatchEventType } from "./types";
import { getSetWins } from "./utils";

export interface PlayerStats {
  playerId: PlayerId;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
}

function didPlayerWin(match: Match, playerId: PlayerId): boolean | null {
  const inTeam1 = match.team1.includes(playerId);
  const { team1Wins, team2Wins } = getSetWins(match.sets);
  if (team1Wins === team2Wins) return null;
  return inTeam1 ? team1Wins > team2Wins : team2Wins > team1Wins;
}

export function calculatePlayerStats(
  playerId: PlayerId,
  matches: Match[]
): PlayerStats {
  const playerMatches = matches
    .filter((m) => m.team1.includes(playerId) || m.team2.includes(playerId))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let wins = 0;
  let losses = 0;
  let currentStreak = 0;
  let bestStreak = 0;

  for (const match of playerMatches) {
    const won = didPlayerWin(match, playerId);
    if (won === true) {
      wins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
    } else if (won === false) {
      losses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
    }
    if (currentStreak > bestStreak) bestStreak = currentStreak;
  }

  return {
    playerId,
    matches: playerMatches.length,
    wins,
    losses,
    winRate: playerMatches.length > 0 ? wins / playerMatches.length : 0,
    currentStreak,
    bestStreak,
  };
}

export interface PartnerStats {
  partnerId: PlayerId;
  matches: number;
  wins: number;
  winRate: number;
}

export function getPartnerStats(
  playerId: PlayerId,
  matches: Match[]
): PartnerStats[] {
  const partnerMap = new Map<PlayerId, { matches: number; wins: number }>();

  for (const match of matches) {
    const inTeam1 = match.team1.includes(playerId);
    const inTeam2 = match.team2.includes(playerId);
    if (!inTeam1 && !inTeam2) continue;

    const team = inTeam1 ? match.team1 : match.team2;
    const partnerId = team.find((id) => id !== playerId);
    if (!partnerId) continue;

    const won = didPlayerWin(match, playerId);
    const existing = partnerMap.get(partnerId) ?? { matches: 0, wins: 0 };
    existing.matches++;
    if (won) existing.wins++;
    partnerMap.set(partnerId, existing);
  }

  return [...partnerMap.entries()]
    .map(([partnerId, data]) => ({
      partnerId,
      ...data,
      winRate: data.matches > 0 ? data.wins / data.matches : 0,
    }))
    .sort((a, b) => b.matches - a.matches);
}

export interface EventLeaderboard {
  type: MatchEventType;
  entries: { playerId: PlayerId; count: number }[];
}

export function getEventLeaderboards(
  events: MatchEvent[]
): EventLeaderboard[] {
  const byType = new Map<MatchEventType, Map<PlayerId, number>>();
  const totals = new Map<MatchEventType, number>();

  for (const event of events) {
    const typeMap = byType.get(event.type) ?? new Map<PlayerId, number>();
    typeMap.set(event.playerId, (typeMap.get(event.playerId) ?? 0) + 1);
    byType.set(event.type, typeMap);
    totals.set(event.type, (totals.get(event.type) ?? 0) + 1);
  }

  return [...byType.entries()]
    .map(([type, playerCounts]) => ({
      type,
      entries: [...playerCounts.entries()]
        .map(([playerId, count]) => ({ playerId, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => (totals.get(b.type) ?? 0) - (totals.get(a.type) ?? 0));
}
