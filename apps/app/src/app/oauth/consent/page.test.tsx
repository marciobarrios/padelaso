import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), getAuthorizationDetails: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: auth.getUser, oauth: { getAuthorizationDetails: auth.getAuthorizationDetails } } }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import ConsentPage from "./page";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MCP_ALLOWED_USER_IDS", id);
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "client");
});
it("keeps authorization_id in the sign-in return path", async () => {
  auth.getUser.mockResolvedValue({ data: { user: null } });
  await expect(ConsentPage({ searchParams: Promise.resolve({ authorization_id: id }) })).rejects.toThrow(
    `REDIRECT:/login?redirectTo=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`,
  );
});
it("does not resolve malformed authorization requests", async () => {
  await ConsentPage({ searchParams: Promise.resolve({ authorization_id: "invalid" }) });
  expect(auth.getUser).not.toHaveBeenCalled();
});
it("does not fetch consent for users outside the allowlist", async () => {
  auth.getUser.mockResolvedValue({ data: { user: { id: "other" } } });
  await ConsentPage({ searchParams: Promise.resolve({ authorization_id: id }) });
  expect(auth.getAuthorizationDetails).not.toHaveBeenCalled();
});
