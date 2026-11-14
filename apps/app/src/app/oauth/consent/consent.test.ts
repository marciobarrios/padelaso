// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeScopes, isSafeClientRedirect, loginPath, parseAuthorizationId } from "./_lib";

const auth = {
  getUser: vi.fn(),
  oauth: {
    getAuthorizationDetails: vi.fn(),
    approveAuthorization: vi.fn(),
    denyAuthorization: vi.fn(),
  },
};

vi.mock("@/lib/supabase-server", () => ({ createServerSupabaseClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const { decideAuthorization } = await import("./actions");

// The real format: 32 random alphanumerics, not a UUID.
const ID = "Ab3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE";
const USER = { id: "22222222-2222-4222-8222-222222222222", email: "ana@example.com" };
const CLIENT = { id: "11111111-1111-4111-8111-111111111111", name: "ChatGPT", uri: "", logo_uri: "" };
const CALLBACK = "https://chatgpt.com/connector/oauth/abc?code=xyz&state=s";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  return (error as { url?: string } | null)?.url;
}

describe("consent helpers", () => {
  it("accepts Supabase authorization IDs and rejects anything unsafe to embed", () => {
    expect(parseAuthorizationId(ID)).toBe(ID);
    expect(parseAuthorizationId("6f1c9a8e-3b2d-4c5e-8f7a-9b0c1d2e3f4a")).not.toBeNull();
    for (const bad of [undefined, "", "short", `${ID}&next=/evil`, "../../etc", ID.repeat(5), ["a"]]) {
      expect(parseAuthorizationId(bad)).toBeNull();
    }
  });

  it("keeps the authorization through the Google sign-in return path", () => {
    const next = new URL(loginPath(ID), "https://padelaso.test").searchParams.get("redirectTo");
    expect(next).toBe(`/oauth/consent?authorization_id=${ID}`);
  });

  it("allows client callbacks, including custom schemes, but not script URLs", () => {
    expect(isSafeClientRedirect(CALLBACK)).toBe(true);
    expect(isSafeClientRedirect("cursor://anysphere.cursor-mcp/oauth/callback?code=1")).toBe(true);
    expect(isSafeClientRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeClientRedirect("not a url")).toBe(false);
  });

  it("labels identity scopes", () => {
    expect(describeScopes("openid email email custom")).toEqual([
      "Tu identidad en Padelaso", "Tu dirección de email", "custom",
    ]);
    expect(describeScopes(undefined)).toEqual([]);
  });
});

describe("decideAuthorization", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", CLIENT.id);
    vi.stubEnv("MCP_ALLOWED_USER_IDS", USER.id);
    auth.getUser.mockResolvedValue({ data: { user: USER } });
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { authorization_id: ID, redirect_uri: "https://chatgpt.com/connector/oauth/abc", client: CLIENT, user: USER, scope: "email" },
      error: null,
    });
    auth.oauth.approveAuthorization.mockResolvedValue({ data: { redirect_url: CALLBACK }, error: null });
    auth.oauth.denyAuthorization.mockResolvedValue({ data: { redirect_url: `${CALLBACK}&error=access_denied` }, error: null });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("approves on the server and returns the browser to the client", async () => {
    expect(await redirectOf(decideAuthorization(form({ authorization_id: ID, decision: "approve" })))).toBe(CALLBACK);
    expect(auth.oauth.approveAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
  });

  it("denies without requiring access", async () => {
    vi.stubEnv("MCP_ALLOWED_USER_IDS", "");
    expect(await redirectOf(decideAuthorization(form({ authorization_id: ID, decision: "deny" }))))
      .toContain("error=access_denied");
    expect(auth.oauth.approveAuthorization).not.toHaveBeenCalled();
  });

  it.each([
    ["a user outside the beta", { MCP_ALLOWED_USER_IDS: "" }],
    ["a client that is not allowlisted", { MCP_ALLOWED_CLIENT_IDS: "someone-else" }],
  ])("never approves for %s, even when the action is called directly", async (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    expect(await redirectOf(decideAuthorization(form({ authorization_id: ID, decision: "approve" }))))
      .toBe(`/oauth/consent?authorization_id=${ID}`);
    expect(auth.oauth.approveAuthorization).not.toHaveBeenCalled();
  });

  it("sends signed-out users to sign in, keeping the request", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await redirectOf(decideAuthorization(form({ authorization_id: ID, decision: "approve" }))))
      .toBe(loginPath(ID));
  });

  it("rejects malformed submissions and expired requests", async () => {
    expect(await redirectOf(decideAuthorization(form({ authorization_id: "x", decision: "approve" }))))
      .toBe("/oauth/consent?error=invalid");
    expect(await redirectOf(decideAuthorization(form({ authorization_id: ID, decision: "maybe" }))))
      .toBe("/oauth/consent?error=invalid");
    auth.oauth.denyAuthorization.mockResolvedValue({ data: null, error: new Error("expired") });
    expect(await redirectOf(decideAuthorization(form({ authorization_id: ID, decision: "deny" }))))
      .toBe("/oauth/consent?error=expired");
  });
});
