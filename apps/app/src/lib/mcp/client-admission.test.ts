// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canUseMcpClient } from "./client-admission";

const { getClient, captureException, clear, addEventProcessor } = vi.hoisted(() => ({
  getClient: vi.fn(), captureException: vi.fn(), clear: vi.fn(), addEventProcessor: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException, withScope: (callback: (scope: unknown) => void) => callback({ clear, addEventProcessor }),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabaseClient: () => ({ auth: { admin: { oauth: { getClient } } } }),
}));
const ID = "11111111-1111-4111-8111-111111111111";
const CALLBACK = "https://chatgpt.com/connector/oauth/test-callback";
const client = (overrides = {}) => ({
  client_id: ID, registration_type: "dynamic", redirect_uris: [CALLBACK], ...overrides,
});

beforeEach(() => {
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "");
  vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "true");
  getClient.mockResolvedValue({ data: client(), error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("MCP client admission", () => {
  it("retains manual connections without an admin lookup, including during rollback", async () => {
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", ID);
    vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "false");
    expect(await canUseMcpClient(ID)).toBe(true);
    expect(getClient).not.toHaveBeenCalled();
  });
  it("is opt-in and never looks up arbitrary non-UUID IDs", async () => {
    for (const value of ["", "false", "TRUE"]) {
      vi.stubEnv("MCP_SELF_SERVICE_ENABLED", value);
      expect(await canUseMcpClient(ID)).toBe(false);
    }
    vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "true");
    expect(await canUseMcpClient("../clients")).toBe(false);
    expect(getClient).not.toHaveBeenCalled();
  });
  it.each([CALLBACK, "https://chatgpt.com/connector_platform_oauth_redirect"])("admits a registered dynamic ChatGPT callback: %s", async (uri) => {
    getClient.mockResolvedValue({ data: client({ redirect_uris: [uri] }), error: null });
    expect(await canUseMcpClient(ID)).toBe(true);
    expect(getClient).toHaveBeenCalledWith(ID);
    expect(captureException).not.toHaveBeenCalled();
  });
  it.each([
    "http://chatgpt.com/connector/oauth/abc", "https://chatgpt.com.evil.test/connector/oauth/abc",
    "https://evil.test/connector/oauth/abc", "https://chatgpt.com@evil.test/connector/oauth/abc",
    "https://user@chatgpt.com/connector/oauth/abc", "https://chatgpt.com:444/connector/oauth/abc",
    "https://chatgpt.com/connector/oauth/abc?next=https://evil.test", "https://chatgpt.com/connector/oauth/abc#x",
    "https://chatgpt.com/connector/oauth/", "https://chatgpt.com/connector/oauth/abc/extra",
    "https://chatgpt.com/connector/oauth/abc\n", "https://chatgpt.com/connector/oauth/%2f", "https://chatgpt.com/other", "not-a-url",
  ])("refuses an untrusted callback: %s", async (uri) => {
    getClient.mockResolvedValue({ data: client({ redirect_uris: [CALLBACK, uri] }), error: null });
    expect(await canUseMcpClient(ID)).toBe(false);
  });
  it.each([{ registration_type: "manual" }, { client_id: "other" }, { redirect_uris: [] }])("refuses clients outside the registration policy: %j", async (overrides) => {
    getClient.mockResolvedValue({ data: client(overrides), error: null });
    expect(await canUseMcpClient(ID)).toBe(false);
  });
  it("rejects removed clients and does not cache admission", async () => {
    expect(await canUseMcpClient(ID)).toBe(true);
    getClient.mockResolvedValue({ data: null, error: { status: 404 } });
    expect(await canUseMcpClient(ID)).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });
  it("fails closed with a fixed error on registry outages", async () => {
    getClient.mockResolvedValue({ data: null, error: { status: 503, message: "sensitive" } });
    await expect(canUseMcpClient(ID)).rejects.toThrow("Client verification is temporarily unavailable");
    expect(clear).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "MCP client registry unavailable" }));
    const sanitize = addEventProcessor.mock.calls[0][0];
    const event = sanitize({ event_id: "event", request: { headers: { Authorization: "secret" } }, extra: { email: "private" } });
    expect(event).toEqual({ event_id: "event", fingerprint: ["mcp-client-registry"], tags: { operation: "mcp-client-registry" } });
  });
});
