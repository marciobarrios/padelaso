import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";
const { signOut, clear } = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }), clear: vi.fn() }));
const client = { auth: { signOut, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
vi.mock("@/lib/supabase", () => ({ getBrowserClient: () => client }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/group/group-provider", () => ({ GroupProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/active-group-cookie", () => ({ clearActiveGroupCookie: clear }));
function SignOutButton() { const { signOut } = useAuth(); return <button onClick={signOut}>Salir</button>; }
it("signs out only the current web session and clears its group cookie", async () => {
  render(<AuthProvider><SignOutButton /></AuthProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(clear).toHaveBeenCalled();
});
