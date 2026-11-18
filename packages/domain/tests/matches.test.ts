import { describe, expect, it } from "vitest";

import {
  applyScoreDelta,
  getSetWins,
  validateMatchDraft,
  validateMatchSets,
  validateMatchTeams,
  type MatchDraft,
} from "../src/matches";

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

describe("recording a finished match", () => {
  const draft = (overrides: Partial<MatchDraft> = {}): MatchDraft => ({
    team1: ["ana", "pablo"],
    team2: ["lucia", "marta"],
    sets: [{ team1Score: 6, team2Score: 4 }, { team1Score: 7, team2Score: 6 }],
    events: [{ playerId: "ana", type: "ace" }],
    ...overrides,
  });
  const code = (overrides: Partial<MatchDraft>) => validateMatchDraft(draft(overrides))?.code;

  it("accepts a complete match, including a tie and no events", () => {
    expect(validateMatchDraft(draft())).toBeNull();
    expect(code({ sets: [{ team1Score: 6, team2Score: 4 }, { team1Score: 3, team2Score: 6 }], events: undefined })).toBeUndefined();
  });

  it("requires two teams of two different players", () => {
    expect(code({ team1: ["ana"] })).toBe("INVALID_TEAMS");
    expect(code({ team2: ["lucia", "marta", "jose"] })).toBe("INVALID_TEAMS");
    expect(code({ team2: ["ana", "marta"] })).toBe("INVALID_TEAMS");
    expect(code({ team1: ["ana", "ana"] })).toBe("INVALID_TEAMS");
  });

  it("requires 1 to 5 played sets with whole scores up to 99", () => {
    const set = { team1Score: 6, team2Score: 4 };
    expect(code({ sets: [] })).toBe("INVALID_SETS");
    expect(code({ sets: Array(6).fill(set) })).toBe("INVALID_SETS");
    expect(code({ sets: Array(5).fill(set) })).toBeUndefined();
    expect(code({ sets: [{ team1Score: -1, team2Score: 6 }] })).toBe("INVALID_SETS");
    expect(code({ sets: [{ team1Score: 6.5, team2Score: 4 }] })).toBe("INVALID_SETS");
    expect(code({ sets: [{ team1Score: 100, team2Score: 4 }] })).toBe("INVALID_SETS");
    expect(validateMatchDraft(draft({ sets: [set, { team1Score: 0, team2Score: 0 }] }))?.message).toMatch(/Set 2 has no score/);
  });

  it("accepts events only for match players with a current event type", () => {
    expect(code({ events: [{ playerId: "jose", type: "ace" }] })).toBe("INVALID_EVENTS");
    expect(code({ events: [{ playerId: "ana", type: "bola_fuera" }] })).toBe("INVALID_EVENTS");
    expect(code({ events: [{ playerId: "ana", type: "made_up" }] })).toBe("INVALID_EVENTS");
    expect(code({ events: Array(51).fill({ playerId: "ana", type: "ace" }) })).toBe("INVALID_EVENTS");
  });
});

describe("correcting a recorded match", () => {
  it("checks teams on their own, with the same rule as a new match", () => {
    expect(validateMatchTeams(["ana", "pablo"], ["lucia", "marta"])).toBeNull();
    expect(validateMatchTeams(["ana"], ["lucia", "marta"])?.code).toBe("INVALID_TEAMS");
    expect(validateMatchTeams(["ana", "pablo"], ["pablo", "marta"])?.message).toBe("A match needs four different players.");
  });

  it("checks sets on their own, with the same rule as a new match", () => {
    expect(validateMatchSets([{ team1Score: 6, team2Score: 4 }])).toBeNull();
    expect(validateMatchSets([])?.code).toBe("INVALID_SETS");
    expect(validateMatchSets([{ team1Score: 6, team2Score: 4 }, { team1Score: 0, team2Score: 0 }])?.message)
      .toMatch(/Set 2 has no score/);
    expect(validateMatchSets([{ team1Score: 100, team2Score: 4 }])?.code).toBe("INVALID_SETS");
  });
});
