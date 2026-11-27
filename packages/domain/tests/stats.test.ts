import { describe, expect, it } from "vitest";

import {
  calculatePlayerStats,
  filterMatchesFrom,
  getGroupRanking,
  getMinimumMatchesForRanking,
  getPlayerVersusStats,
  getRankedPlayerStats,
  getTimeRangeCutoff,
  MIN_MATCHES_FOR_RATE,
  sortPairStats,
  type PairStats,
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

describe("time ranges", () => {
  const now = Date.parse("2026-11-27T12:00:00Z");

  it("has no cutoff for all time and counts back whole days otherwise", () => {
    expect(getTimeRangeCutoff("all", now)).toBeNull();
    expect(getTimeRangeCutoff("30d", now)).toBe(now - 30 * 86_400_000);
    expect(getTimeRangeCutoff("90d", now)).toBe(now - 90 * 86_400_000);
  });

  it("keeps matches played at or after the cutoff", () => {
    const cutoff = getTimeRangeCutoff("30d", now);
    const matches = [
      match("old", "2026-10-27T11:59:59Z", ["a", "b"], ["c", "d"], [{ team1Score: 6, team2Score: 0 }]),
      match("edge", "2026-10-28T12:00:00Z", ["a", "b"], ["c", "d"], [{ team1Score: 6, team2Score: 0 }]),
      match("new", new Date(now).toISOString(), ["a", "b"], ["c", "d"], [{ team1Score: 6, team2Score: 0 }]),
    ];
    expect(filterMatchesFrom(matches, cutoff).map((m) => m.id)).toEqual(["edge", "new"]);
    expect(filterMatchesFrom(matches, null)).toBe(matches);
  });
});

describe("group ranking", () => {
  it("ranks only players with matches, with a threshold from the group's match count", () => {
    const matches = [
      match("m1", "2026-01-01", ["a", "b"], ["c", "d"], [{ team1Score: 6, team2Score: 1 }]),
      match("m2", "2026-01-02", ["a", "c"], ["b", "d"], [{ team1Score: 6, team2Score: 1 }]),
      match("m3", "2026-01-03", ["a", "d"], ["b", "e"], [{ team1Score: 6, team2Score: 1 }]),
    ];
    const { minimumMatches, ranked } = getGroupRanking(["a", "b", "c", "d", "e", "idle"], matches);
    expect(minimumMatches).toBe(2);
    expect(ranked.map((s) => s.playerId)).not.toContain("idle");
    expect(ranked[0].playerId).toBe("a");
    expect(ranked.at(-1)).toMatchObject({ playerId: "e", provisional: true });
    expect(ranked).toEqual(getRankedPlayerStats(
      ["a", "b", "c", "d", "e"].map((id) => calculatePlayerStats(id, matches)), 2));
  });
});

describe("player versus player", () => {
  const sets = (team1Score: number, team2Score: number) => [{ team1Score, team2Score }];

  it("counts every decided match on opposite teams, whoever the partners were", () => {
    const matches = [
      match("ana-wins", "2026-01-01", ["ana", "x"], ["pedro", "y"], sets(6, 2)),
      match("pedro-wins-as-team1", "2026-01-02", ["pedro", "z"], ["w", "ana"], sets(6, 3)),
      match("ana-wins-as-team2", "2026-01-03", ["pedro", "x"], ["ana", "z"], sets(1, 6)),
      match("tie", "2026-01-04", ["ana", "x"], ["pedro", "y"], [
        { team1Score: 6, team2Score: 2 }, { team1Score: 2, team2Score: 6 },
      ]),
      match("partners", "2026-01-05", ["ana", "pedro"], ["x", "y"], sets(6, 0)),
      match("without-pedro", "2026-01-06", ["ana", "x"], ["y", "z"], sets(6, 0)),
    ];
    expect(getPlayerVersusStats("ana", "pedro", matches)).toEqual({ matches: 3, player1Wins: 2, player2Wins: 1 });
    expect(getPlayerVersusStats("pedro", "ana", matches)).toEqual({ matches: 3, player1Wins: 1, player2Wins: 2 });
  });

  it("is empty when the players never faced each other", () => {
    expect(getPlayerVersusStats("ana", "pedro", [])).toEqual({ matches: 0, player1Wins: 0, player2Wins: 0 });
  });
});

describe("pair ordering", () => {
  const pair = (id: string, matches: number, wins: number): PairStats => ({
    player1Id: id, player2Id: `${id}-partner`, matches, wins, losses: matches - wins,
    winRate: matches > 0 ? wins / matches : 0, currentStreak: 0,
  });
  const pairs = [pair("busy", 10, 5), pair("lucky", 1, 1), pair("good", 4, 3), pair("great", 3, 3), pair("solid", 8, 6)];

  it("orders by matches played, then win rate", () => {
    expect(sortPairStats(pairs, "matches").map((p) => p.player1Id)).toEqual(["busy", "solid", "good", "great", "lucky"]);
  });

  it(`orders by win rate among pairs with at least ${MIN_MATCHES_FOR_RATE} matches, then by matches`, () => {
    const byRate = sortPairStats([...pairs, pair("also-solid", 4, 3)], "winRate");
    expect(byRate.map((p) => p.player1Id)).toEqual(["great", "solid", "good", "also-solid", "busy"]);
  });

  it("does not reorder its input", () => {
    const input = [...pairs];
    sortPairStats(input, "winRate");
    expect(input).toEqual(pairs);
  });
});
