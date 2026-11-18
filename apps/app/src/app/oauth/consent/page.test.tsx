import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ConsentPage from "./page";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: { id: "any-user", email: "test@example.com" } } }),
    oauth: { getAuthorizationDetails: async () => ({ data: {
      authorization_id: "Ab3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE",
      client: { id: "client", name: "Test client" },
      user: { email: "test@example.com" },
      redirect_uri: "https://example.com/callback",
    }, error: null }) },
  } }),
}));
vi.mock("./consent-form", () => ({ ConsentForm: ({ canApprove }: { canApprove: boolean }) => <button disabled={!canApprove}>Permitir</button> }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe("MCP consent page", () => {
  const params = { searchParams: Promise.resolve({ authorization_id: "Ab3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE" }) };
  it("offers the single permission to any signed-in user for an allowed client", async () => {
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "client");
    render(await ConsentPage(params));
    expect(screen.getByText("Permiso: leer y registrar partidos")).toBeTruthy();
    // States every write the tools can make: removing one event (MAR-159) and correcting a match (MAR-160).
    expect(screen.getByText(/Quitar un evento registrado por error, de uno en uno/)).toBeTruthy();
    expect(screen.getByText(/corregir su fecha, pista, equipos o resultado/)).toBeTruthy();
    expect(screen.getByText("No incluye herramientas para borrar partidos, ni cambiar ni borrar jugadores o grupos")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Permitir" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each(["", "another-client"])("blames the client when not allowlisted (%s)", async (clients) => {
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", clients);
    render(await ConsentPage(params));
    expect(screen.getByRole("alert").textContent).toBe("Esta aplicación todavía no puede conectarse a Padelaso.");
    expect(screen.queryByText(/todavía no están disponibles para tu cuenta/)).toBeNull();
    expect((screen.getByRole("button", { name: "Permitir" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
