import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePageContent } from "./home-page-content";
import { GroupDataHydrator } from "@/lib/swr-hydration";

const { state, query } = vi.hoisted(() => ({
  state: { groupId: "group-a" },
  query: vi.fn(),
}));

vi.mock("@/components/group/group-provider", () => ({
  useGroup: () => ({ activeGroup: { id: state.groupId } }),
}));
vi.mock("@/components/match/match-card", () => ({
  MatchCard: ({ match }: { match: { id: string } }) => <p>Partido {match.id}</p>,
}));
vi.mock("@/lib/supabase", () => ({
  getBrowserClient: () => ({
    from: (table: string) => ({
      select() { return this; },
      eq(_column: string, groupId: string) {
        return { order: () => query(table, groupId) };
      },
    }),
  }),
}));

const player = { id: "ana", name: "Ana", emoji: "🎾", group_id: "group-a", created_at: "2026-11-06" };
const match = { id: "new", group_id: "group-a", date: "2026-11-06", team1: [], team2: [], sets: [], created_at: "2026-11-06" };

function Home() {
  return (
    <GroupDataHydrator groupId={state.groupId}>
      <HomePageContent />
    </GroupDataHydrator>
  );
}

function renderHome() {
  return render(<Home />, {
    wrapper: ({ children }) => <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{children}</SWRConfig>,
  });
}

beforeEach(() => {
  state.groupId = "group-a";
  query.mockReset().mockImplementation(async (table: string) => ({ data: table === "players" ? [player] : [], error: null }));
});

describe("refreshing home data", () => {
  it("refreshes both group-scoped queries despite the hydration deduping interval and updates the UI", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("0 partidos · 1 jugador");
    query.mockClear().mockImplementation(async (table: string) => ({ data: table === "players" ? [player, { ...player, id: "bruno" }] : [match], error: null }));
    const button = screen.getByRole("button", { name: "Actualizar inicio" });
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByText("1 partido · 2 jugadores");
    expect(screen.getByText("Partido new")).toBeTruthy();
    expect(query.mock.calls).toEqual(expect.arrayContaining([["matches", "group-a"], ["players", "group-a"]]));
    expect(query).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toBe("Inicio actualizado");
  });

  it("keeps cached data on failure, waits for both requests, and can retry", async () => {
    renderHome();
    await screen.findByText("0 partidos · 1 jugador");
    let finish!: (value: unknown) => void;
    query.mockImplementation((table: string) => table === "players"
      ? Promise.resolve({ data: null, error: { message: "offline" } })
      : new Promise((resolve) => { finish = resolve; }));
    const button = screen.getByRole("button", { name: "Actualizar inicio" });
    fireEvent.click(button);
    await act(async () => {});
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("0 partidos · 1 jugador")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Actualizando…");
    await act(async () => finish({ data: [], error: null }));
    expect(screen.getByRole("status").textContent).toContain("No se pudo actualizar");
    expect(screen.getByText("0 partidos · 1 jugador")).toBeTruthy();
    query.mockResolvedValue({ data: [], error: null });
    fireEvent.click(button);
    await screen.findByText("0 partidos · 0 jugadores");
    expect(screen.getByRole("status").textContent).toBe("Inicio actualizado");
  });

  it("does not apply a previous group's pending refresh state to the new home", async () => {
    const { rerender } = renderHome();
    await screen.findByText("0 partidos · 1 jugador");
    let finish!: (value: unknown) => void;
    query.mockImplementation((table: string) => table === "players"
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: [], error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar inicio" }));
    query.mockResolvedValue({ data: [], error: null });
    state.groupId = "group-b";
    rerender(<Home />);
    await screen.findByText("0 partidos · 0 jugadores");
    await act(async () => finish({ data: [player], error: null }));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByText("0 partidos · 0 jugadores")).toBeTruthy();
    query.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar inicio" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Inicio actualizado"));
    expect(query.mock.calls).toEqual(expect.arrayContaining([["matches", "group-b"], ["players", "group-b"]]));
  });
});
