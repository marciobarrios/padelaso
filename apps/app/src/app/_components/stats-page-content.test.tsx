import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Match, MatchEvent, MatchVote, Player } from "@padelaso/domain/types";
import { StatsPageContent } from "./stats-page-content";

const { state } = vi.hoisted(() => ({
  state: { groupId: "group", players: [] as Player[], matches: [] as Match[], events: [] as MatchEvent[], votes: [] as MatchVote[] },
}));

vi.mock("@/components/group/group-provider", () => ({
  useGroup: () => ({ activeGroup: { id: state.groupId } }),
}));
vi.mock("@/components/layout/page-header", () => ({
  PageHeader: () => <h1>Stats</h1>,
}));
vi.mock("@/lib/db-hooks", () => ({
  usePlayers: () => ({ players: state.players, loaded: true }),
  useMatches: () => ({ matches: state.matches, loaded: true }),
  useAllMatchEvents: () => ({ events: state.events, loaded: true }),
  useAllMatchVotes: () => ({ votes: state.votes, loaded: true }),
}));

function attribute(card: HTMLElement, label: string) {
  return within(card).getByText(label).closest("div")?.querySelector("dd")?.textContent;
}

describe("player cards in statistics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-11-05T12:00:00Z").getTime());
    state.groupId = "group";
    state.votes = [];
    state.players = ["Ana", "Bruno", "Carla", "Diego"].map((name) => ({
      id: name.toLowerCase(), name, emoji: "🎾", groupId: "group", createdAt: "2026-01-01",
    }));
    state.matches = ["2026-01-01", "2026-11-04"].map((date, index) => ({
      id: `match-${index}`, date, createdAt: date, groupId: "group",
      team1: ["ana", "bruno"], team2: ["carla", "diego"],
      sets: [{ team1Score: 6, team2Score: 2 }],
    }));
    state.events = [
      { id: "old", matchId: "match-0", playerId: "ana", type: "ace", createdAt: "2026-01-01" },
      { id: "new", matchId: "match-1", playerId: "ana", type: "ace", createdAt: "2026-11-04" },
      { id: "other", matchId: "match-1", playerId: "bruno", type: "doble_falta", createdAt: "2026-11-04" },
    ];
  });

  it("opens the selected player's card by keyboard, restores focus, and can open another player", async () => {
    const user = userEvent.setup();
    render(<StatsPageContent />);
    const trigger = screen.getByRole("button", { name: "Ver cromo de Ana" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Cromo de Ana" });
    expect(attribute(dialog, "Aciertos")).toBe("2");
    expect(within(dialog).getByRole("link", { name: "Ver perfil completo" }).getAttribute("href")).toBe("/players/ana");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.click(screen.getByRole("button", { name: "Ver cromo de Bruno" }));
    const bruno = await screen.findByRole("dialog", { name: "Cromo de Bruno" });
    expect(attribute(bruno, "Fallos")).toBe("1");
    expect(attribute(bruno, "Aciertos")).toBe("0");
  });

  it("uses the selected time range for both events and match results", async () => {
    const user = userEvent.setup();
    render(<StatsPageContent />);
    await user.click(screen.getByRole("tab", { name: "30 días" }));
    await user.click(screen.getByRole("button", { name: "Ver cromo de Ana" }));
    const dialog = await screen.findByRole("dialog", { name: "Cromo de Ana" });
    expect(attribute(dialog, "Aciertos")).toBe("1");
    expect(within(dialog).getByText("1 partido")).toBeTruthy();
    expect(within(dialog).getByText("Últimos 30 días")).toBeTruthy();
  });

  it("opens cards from event leaders and pairs without nesting buttons", async () => {
    const user = userEvent.setup();
    const { container } = render(<StatsPageContent />);
    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    await user.click(screen.getByRole("button", { name: "Ver cromo de Ana" }));
    expect(await screen.findByRole("dialog", { name: "Cromo de Ana" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Clasificación de Ace" }));
    expect(container.querySelector("button button")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Parejas" }));
    await user.click(screen.getAllByRole("button", { name: "Ver cromo de Carla" })[0]);
    expect(await screen.findByRole("dialog", { name: "Cromo de Carla" })).toBeTruthy();
  });

  it("keeps provisional, MVP, and achievement sections collapsed while allowing cards after expansion", async () => {
    const user = userEvent.setup();
    state.players.push({ id: "eva", name: "Eva", emoji: "🎾", groupId: "group", createdAt: "2026-11-04" });
    state.matches.push({ ...state.matches[1], id: "match-2", team2: ["carla", "eva"] });
    state.events.push({ ...state.events[1], id: "another-ace" });
    state.votes = [{
      id: "mvp", matchId: "match-1", voterPlayerId: "bruno",
      votedForPlayerId: "ana", voteType: "mvp", createdAt: "2026-11-04",
    }];
    render(<StatsPageContent />);

    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Stats", "Ranking de rendimiento", "🏆 MVP", "Logros",
    ]);
    const sections = [
      { element: screen.getByText(/Provisionales · menos de/), player: "Eva" },
      { element: screen.getByRole("heading", { name: "🏆 MVP" }), player: "Ana" },
      { element: screen.getByRole("heading", { name: "Logros" }), player: "Ana" },
    ];

    for (const { element, player } of sections) {
      const section = element.closest("details");
      const summary = section?.querySelector("summary");
      if (!section || !summary) throw new Error("Expected a collapsible statistics section");
      expect(section.open).toBe(false);
      await user.click(summary);
      expect(section.open).toBe(true);
      await user.click(within(section).getByRole("button", { name: `Ver cromo de ${player}` }));
      expect(await screen.findByRole("dialog", { name: `Cromo de ${player}` })).toBeTruthy();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await user.click(summary);
      expect(section.open).toBe(false);
    }
  });

  it("closes a previous group's card when switching groups", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StatsPageContent />);
    await user.click(screen.getByRole("button", { name: "Ver cromo de Ana" }));
    await screen.findByRole("dialog", { name: "Cromo de Ana" });
    state.groupId = "another-group";
    state.players = [];
    state.matches = [];
    state.events = [];
    rerender(<StatsPageContent />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
