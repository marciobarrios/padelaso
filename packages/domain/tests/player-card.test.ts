import { describe, expect, it } from "vitest";
import { calculatePlayerCardStats } from "../src/player-card";
import type { Match, MatchEvent, MatchEventType } from "../src/types";

const match: Match = {
  id: "match",
  date: "2026-11-04",
  createdAt: "2026-11-04",
  groupId: "group",
  team1: ["ana", "bruno"],
  team2: ["carla", "diego"],
  sets: [{ team1Score: 6, team2Score: 2 }],
};

function event(type: MatchEventType, playerId = "ana", matchId = "match"): MatchEvent {
  return { id: `${type}-${playerId}-${matchId}`, type, playerId, matchId, createdAt: "2026-11-04" };
}

describe("player trading card statistics", () => {
  it("counts each sentiment, including retired events, without mixing players or periods", () => {
    const stats = calculatePlayerCardStats("ana", [match], [
      event("ace"), event("ace"), event("salvada_top"),
      event("doble_falta"), event("bola_fuera"), event("magic"),
      event("ace", "bruno"), event("ace", "ana", "outside-period"),
    ]);

    expect(stats).toMatchObject({
      aciertos: 3,
      fallos: 2,
      espectaculo: 1,
      signature: { event: { type: "ace" }, count: 2 },
      results: { matches: 1, wins: 1, losses: 0, currentStreak: 1, bestStreak: 1 },
    });
  });

  it("ignores events in matches where the player did not participate", () => {
    const unrelated = { ...match, id: "unrelated", team1: ["eve", "bruno"] };
    const stats = calculatePlayerCardStats("ana", [unrelated], [event("ace", "ana", "unrelated")]);
    expect(stats.aciertos).toBe(0);
    expect(stats.results.matches).toBe(0);
    expect(stats.signature).toBeNull();
  });

  it("gives a debutant an empty card without inventing a signature", () => {
    expect(calculatePlayerCardStats("ana", [], [event("ace")])).toMatchObject({
      aciertos: 0, fallos: 0, espectaculo: 0, signature: null,
      results: { matches: 0, currentStreak: 0, bestStreak: 0 },
    });
  });

  it("chooses the same signature when equally frequent events arrive in a different order", () => {
    const events = [event("magic"), event("ace")];
    const first = calculatePlayerCardStats("ana", [match], events);
    const second = calculatePlayerCardStats("ana", [match], [...events].reverse());
    expect(first.signature).toEqual(second.signature);
    expect(first.signature?.event.type).toBe("ace");
  });
});
