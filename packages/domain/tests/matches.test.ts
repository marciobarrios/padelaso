import { describe, expect, it } from "vitest";

import { applyScoreDelta, getSetWins } from "../src/matches";

describe("match scoring", () => {
  it("counts decided sets and ignores tied sets", () => {
    expect(
      getSetWins([
        { team1Score: 6, team2Score: 3 },
        { team1Score: 4, team2Score: 6 },
        { team1Score: 5, team2Score: 5 },
      ]),
    ).toEqual({ team1Wins: 1, team2Wins: 1 });
  });

  it("applies a score delta only to the latest set without mutating history", () => {
    const sets = [
      { team1Score: 6, team2Score: 4 },
      { team1Score: 2, team2Score: 3 },
    ];

    expect(applyScoreDelta(sets, 2, 2)).toEqual([
      { team1Score: 6, team2Score: 4 },
      { team1Score: 2, team2Score: 5 },
    ]);
    expect(sets).toEqual([
      { team1Score: 6, team2Score: 4 },
      { team1Score: 2, team2Score: 3 },
    ]);
  });

  it("starts an empty scoreboard and never decrements below zero", () => {
    expect(applyScoreDelta([], 1, 1)).toEqual([
      { team1Score: 1, team2Score: 0 },
    ]);
    expect(
      applyScoreDelta([{ team1Score: 0, team2Score: 2 }], 1, -1),
    ).toEqual([{ team1Score: 0, team2Score: 2 }]);
  });
});
