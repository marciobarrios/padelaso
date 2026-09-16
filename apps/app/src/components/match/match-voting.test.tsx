import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Match, MatchVote, Player } from "@padelaso/domain/types";

import { MatchVoting } from "./match-voting";

const { castMatchVote, removeMatchVote } = vi.hoisted(() => ({
  castMatchVote: vi.fn(),
  removeMatchVote: vi.fn(),
}));

vi.mock("@/lib/db-hooks", () => ({
  invalidate: vi.fn(),
  keys: { matchVotes: (matchId: string) => ["match-votes", matchId] },
}));

vi.mock("@/lib/supabase-mutations", () => ({
  castMatchVote,
  removeMatchVote,
}));

const players: Player[] = [
  { id: "ana", name: "Ana", emoji: "A", groupId: "group", createdAt: "2026-01-01" },
  { id: "bruno", name: "Bruno", emoji: "B", groupId: "group", createdAt: "2026-01-01" },
  { id: "carla", name: "Carla", emoji: "C", groupId: "group", createdAt: "2026-01-01" },
  { id: "diego", name: "Diego", emoji: "D", groupId: "group", createdAt: "2026-01-01" },
];

const match: Match = {
  id: "match",
  date: "2026-01-01",
  team1: ["ana", "bruno"],
  team2: ["carla", "diego"],
  sets: [{ team1Score: 6, team2Score: 4 }],
  groupId: "group",
  createdAt: "2026-01-01",
};

const config = { type: "mvp" as const, emoji: "T", label: "MVP" };

function vote(
  id: string,
  voterPlayerId: string,
  votedForPlayerId: string,
): MatchVote {
  return {
    id,
    matchId: match.id,
    voterPlayerId,
    votedForPlayerId,
    voteType: "mvp",
    createdAt: "2026-01-01",
  };
}

describe("match voting", () => {
  beforeEach(() => {
    castMatchVote.mockReset();
    removeMatchVote.mockReset();
  });

  it("lets a participant cast a vote before results are available", async () => {
    const user = userEvent.setup();
    render(
      <MatchVoting
        match={match}
        votes={[]}
        players={players}
        currentUserPlayerId="ana"
        config={config}
      />,
    );

    await user.click(screen.getByRole("button", { name: /elige mvp/i }));
    await user.click(screen.getByRole("button", { name: /bruno/i }));

    await waitFor(() => {
      expect(castMatchVote).toHaveBeenCalledWith(
        "match",
        "ana",
        "bruno",
        "mvp",
      );
    });
  });

  it("shows a winner after three votes and lets an existing voter change theirs", async () => {
    const user = userEvent.setup();
    render(
      <MatchVoting
        match={match}
        votes={[
          vote("vote-1", "ana", "bruno"),
          vote("vote-2", "carla", "bruno"),
          vote("vote-3", "diego", "carla"),
        ]}
        players={players}
        currentUserPlayerId="ana"
        config={config}
      />,
    );

    expect(screen.getByText("Bruno")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /mvp.*bruno/i }));
    await user.click(screen.getByRole("button", { name: /cambiar voto/i }));
    await user.click(screen.getByRole("button", { name: /carla/i }));

    await waitFor(() => {
      expect(castMatchVote).toHaveBeenCalledWith(
        "match",
        "ana",
        "carla",
        "mvp",
      );
    });
  });

  it("retracts a participant's vote when they select the same player", async () => {
    const user = userEvent.setup();
    render(
      <MatchVoting
        match={match}
        votes={[vote("vote-1", "ana", "bruno")]}
        players={players}
        currentUserPlayerId="ana"
        config={config}
      />,
    );

    await user.click(screen.getByRole("button", { name: /elige mvp/i }));
    await user.click(screen.getByRole("button", { name: /bruno/i }));

    await waitFor(() => {
      expect(removeMatchVote).toHaveBeenCalledWith("match", "ana", "mvp");
    });
  });
});
