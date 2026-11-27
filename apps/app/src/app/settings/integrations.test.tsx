import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { Integrations } from "./integrations";

const { listGrants, revokeGrant } = vi.hoisted(() => ({ listGrants: vi.fn(), revokeGrant: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getBrowserClient: () => ({ auth: { oauth: { listGrants, revokeGrant } } }) }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
const grant = { client: { id: "client", name: "Test AI" }, scopes: [], granted_at: "2026-11-16" };
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
function mount() { render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><Integrations /></SWRConfig>); }
it("shows the empty state", async () => {
  listGrants.mockResolvedValue({ data: [], error: null }); mount();
  expect(await screen.findByText("Sin aplicaciones conectadas")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Cómo conectar un asistente" }).getAttribute("href")).toBe("https://padelaso.com/asistentes?from=app#conectar");
  expect(screen.getByRole("link", { name: "Qué puedes pedirle a un asistente" }).getAttribute("href")).toBe("https://padelaso.com/asistentes?from=app");
});
it("keeps the grant on cancel and removes it only after confirmed success", async () => {
  listGrants.mockResolvedValue({ data: [grant], error: null }); revokeGrant.mockResolvedValue({ error: null }); mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Desconectar Test AI" }));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(revokeGrant).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Desconectar Test AI" }));
  await user.click(screen.getByRole("button", { name: "Desconectar" }));
  await waitFor(() => expect(revokeGrant).toHaveBeenCalledWith({ clientId: "client" }));
  expect(await screen.findByText("Sin aplicaciones conectadas")).toBeTruthy();
});
it("retains the connection and allows retry after a revoke failure", async () => {
  listGrants.mockResolvedValue({ data: [grant], error: null }); revokeGrant.mockResolvedValue({ error: new Error("failed") }); mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Desconectar Test AI" }));
  await user.click(screen.getByRole("button", { name: "Desconectar" }));
  expect((await screen.findByRole("alert")).textContent).toContain("No se pudo desconectar");
  expect(screen.getByRole("button", { name: "Desconectar Test AI" })).toBeTruthy();
});
it("offers retry when loading fails", async () => {
  listGrants.mockResolvedValueOnce({ error: new Error("failed") }).mockResolvedValue({ data: [], error: null }); mount();
  await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("Sin aplicaciones conectadas")).toBeTruthy();
});
