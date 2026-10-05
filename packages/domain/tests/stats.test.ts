import { describe, expect, it } from "vitest";

import {
  calculatePlayerStats,
  getMinimumMatchesForRanking,
  getRankedPlayerStats,
  type PlayerStats,
} from "../src/stats";
import type { Match, MatchSet } from "../src/types";

const GROUP_ID = "group-1";

function match(
  id: string,
  date: string,
  team1: string[],
  team2: string[],
  sets: MatchSet[],
): Match {
  return {
    id,
    date,
    team1,
    team2,
    sets,
    groupId: GROUP_ID,
    createdAt: date,
  };
}

describe("player statistics", () => {
  it("tracks outcomes and streaks chronologically while leaving ties undecided", () => {
    const matches = [
      match("loss-2", "2026-01-05", ["player", "b"], ["c", "d"], [
        { team1Score: 3, team2Score: 6 },
      ]),
      match("win-1", "2026-01-01", ["player", "b"], ["c", "d"], [
        { team1Score: 6, team2Score: 2 },
      ]),
      match("tie", "2026-01-03", ["player", "b"], ["c", "d"], [
        { team1Score: 6, team2Score: 4 },
        { team1Score: 2, team2Score: 6 },
      ]),
      match("loss-1", "2026-01-04", ["c", "d"], ["player", "b"], [
        { team1Score: 6, team2Score: 4 },
      ]),
      match("win-2", "2026-01-02", ["c", "d"], ["player", "b"], [
        { team1Score: 1, team2Score: 6 },
      ]),
    ];

    expect(calculatePlayerStats("player", matches)).toEqual({
      playerId: "player",
      matches: 5,
      wins: 2,
      losses: 2,
      winRate: 0.4,
      currentStreak: -2,
      bestStreak: 2,
    });
  });
});

describe("ranking eligibility", () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 2],
    [10, 5],
    [19, 10],
    [50, 10],
  ])("requires %i group matches to produce a threshold of %i", (matches, expected) => {
    expect(getMinimumMatchesForRanking(matches)).toBe(expected);
  });

  it("places eligible players ahead of stronger provisional players", () => {
    const stats: PlayerStats[] = [
      {
        playerId: "eligible",
        matches: 2,
        wins: 1,
        losses: 1,
        winRate: 0.5,
        currentStreak: -1,
        bestStreak: 1,
      },
      {
        playerId: "provisional",
        matches: 1,
        wins: 1,
        losses: 0,
        winRate: 1,
        currentStreak: 1,
        bestStreak: 1,
      },
    ];

    const ranked = getRankedPlayerStats(stats, 2);

    expect(ranked.map(({ playerId, provisional }) => ({ playerId, provisional }))).toEqual([
      { playerId: "eligible", provisional: false },
      { playerId: "provisional", provisional: true },
    ]);
  });
});
