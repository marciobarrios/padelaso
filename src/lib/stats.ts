import { Match, MatchEvent, MatchVote, PlayerId, MatchEventType } from "./types";
import { getSetWins } from "./utils";
import { type FunAwardConfig } from "./event-config";

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

// ---------- Pair stats ----------

export interface PairStats {
  player1Id: PlayerId;
  player2Id: PlayerId;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
}

function canonicalPairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function canonicalPairIds(a: PlayerId, b: PlayerId): [PlayerId, PlayerId] {
  return a < b ? [a, b] : [b, a];
}

export function getPairStats(matches: Match[]): PairStats[] {
  const pairMap = new Map<
    string,
    { p1: PlayerId; p2: PlayerId; wins: number; losses: number; results: boolean[] }
  >();

  const sorted = [...matches].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const match of sorted) {
    if (match.team1.length !== 2 || match.team2.length !== 2) continue;
    const { team1Wins, team2Wins } = getSetWins(match.sets);
    if (team1Wins === team2Wins) continue;

    const team1Won = team1Wins > team2Wins;

    for (const team of [match.team1, match.team2] as PlayerId[][]) {
      const [p1, p2] = canonicalPairIds(team[0], team[1]);
      const key = canonicalPairKey(p1, p2);
      const existing = pairMap.get(key) ?? { p1, p2, wins: 0, losses: 0, results: [] };
      const won = team === match.team1 ? team1Won : !team1Won;
      if (won) existing.wins++;
      else existing.losses++;
      existing.results.push(won);
      pairMap.set(key, existing);
    }
  }

  return [...pairMap.values()]
    .map(({ p1, p2, wins, losses, results }) => {
      let streak = 0;
      for (let i = results.length - 1; i >= 0; i--) {
        if (i === results.length - 1) {
          streak = results[i] ? 1 : -1;
        } else if (results[i] === results[results.length - 1]) {
          streak += streak > 0 ? 1 : -1;
        } else {
          break;
        }
      }
      const total = wins + losses;
      return {
        player1Id: p1,
        player2Id: p2,
        matches: total,
        wins,
        losses,
        winRate: total > 0 ? wins / total : 0,
        currentStreak: streak,
      };
    })
    .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate);
}

// ---------- Head-to-head stats ----------

export interface HeadToHeadStats {
  pair1: [PlayerId, PlayerId];
  pair2: [PlayerId, PlayerId];
  matches: number;
  pair1Wins: number;
  pair2Wins: number;
}

export function getHeadToHeadStats(matches: Match[]): HeadToHeadStats[] {
  const h2hMap = new Map<
    string,
    { pair1: [PlayerId, PlayerId]; pair2: [PlayerId, PlayerId]; pair1Wins: number; pair2Wins: number }
  >();

  for (const match of matches) {
    if (match.team1.length !== 2 || match.team2.length !== 2) continue;
    const { team1Wins, team2Wins } = getSetWins(match.sets);
    if (team1Wins === team2Wins) continue;

    const pairA = canonicalPairIds(match.team1[0], match.team1[1]);
    const pairB = canonicalPairIds(match.team2[0], match.team2[1]);
    const keyA = canonicalPairKey(...pairA);
    const keyB = canonicalPairKey(...pairB);
    // Canonical matchup key: alphabetically first pair comes first
    const [firstKey, secondKey] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];
    const [firstPair, secondPair] = keyA < keyB ? [pairA, pairB] : [pairB, pairA];
    const matchupKey = `${firstKey}|${secondKey}`;

    const existing = h2hMap.get(matchupKey) ?? {
      pair1: firstPair,
      pair2: secondPair,
      pair1Wins: 0,
      pair2Wins: 0,
    };

    const team1Won = team1Wins > team2Wins;
    const winningPairKey = team1Won
      ? canonicalPairKey(match.team1[0], match.team1[1])
      : canonicalPairKey(match.team2[0], match.team2[1]);

    if (winningPairKey === firstKey) existing.pair1Wins++;
    else existing.pair2Wins++;

    h2hMap.set(matchupKey, existing);
  }

  return [...h2hMap.values()]
    .map((h) => ({ ...h, matches: h.pair1Wins + h.pair2Wins }))
    .sort((a, b) => b.matches - a.matches);
}

// ---------- Recent form ----------

export function getRecentForm(
  playerId: PlayerId,
  matches: Match[],
  lastN = 5
): ("W" | "L")[] {
  return matches
    .filter((m) => m.team1.includes(playerId) || m.team2.includes(playerId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, lastN)
    .filter((m) => didPlayerWin(m, playerId) !== null)
    .map((m) => {
      const won = didPlayerWin(m, playerId);
      return won ? "W" : "L";
    })
    .reverse();
}

// ---------- MVP rankings ----------

export function getMvpRankings(
  votes: MatchVote[]
): { playerId: PlayerId; count: number }[] {
  const counts = new Map<PlayerId, number>();
  for (const vote of votes) {
    if (vote.voteType !== "mvp") continue;
    counts.set(vote.votedForPlayerId, (counts.get(vote.votedForPlayerId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------- Fun awards ----------

export interface FunAwardResult extends FunAwardConfig {
  leaders: { playerId: PlayerId; count: number }[];
}

export function computeFunAwards(
  events: MatchEvent[],
  awards: FunAwardConfig[],
): FunAwardResult[] {
  // Group events by matchId+playerId → count of each event type
  const byMatchPlayer = new Map<string, Map<MatchEventType, number>>();
  for (const e of events) {
    const key = `${e.matchId}:${e.playerId}`;
    const counts = byMatchPlayer.get(key) ?? new Map<MatchEventType, number>();
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    byMatchPlayer.set(key, counts);
  }

  return awards.map((award) => {
    // How many times each event type is required for this award
    const required = new Map<MatchEventType, number>();
    for (const t of award.events) {
      required.set(t, (required.get(t) ?? 0) + 1);
    }

    const playerCounts = new Map<PlayerId, number>();
    for (const [key, typeCounts] of byMatchPlayer) {
      let qualifies = true;
      for (const [type, minCount] of required) {
        if ((typeCounts.get(type) ?? 0) < minCount) {
          qualifies = false;
          break;
        }
      }
      if (qualifies) {
        const playerId = key.split(":")[1];
        playerCounts.set(playerId, (playerCounts.get(playerId) ?? 0) + 1);
      }
    }

    const leaders = [...playerCounts.entries()]
      .map(([playerId, count]) => ({ playerId, count }))
      .sort((a, b) => b.count - a.count);
    return { ...award, leaders };
  });
}
