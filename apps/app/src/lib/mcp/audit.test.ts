// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { auditMcpRequest } from "./audit";
import { createBeforeSend } from "../sentry-options";

const auth: AuthInfo = { token: "private-token", clientId: "client-a", scopes: [], extra: { userId: "user-a" } };
const request = (name = "list_groups") => new Request("https://padelaso.test/api/mcp", {
  method: "POST", body: JSON.stringify({ method: "tools/call", id: 1, params: { name } }),
});
afterEach(async () => { await Sentry.close(); vi.restoreAllMocks(); });

describe("audit isolation", () => {
  it("preserves an unparseable original response", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = new Response("original-wire-response", { status: 202, headers: { "X-Original": "yes" } });
    const result = await auditMcpRequest(request(), auth, async () => response);
    expect(result).toBe(response);
    expect(result.status).toBe(202);
    expect(result.headers.get("X-Original")).toBe("yes");
    expect(await result.text()).toBe("original-wire-response");
  });

  it("emits sanitized real SDK events and keeps tool/client failures distinct", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const envelopes: unknown[] = [];
    Sentry.init({ dsn: "https://public@example.test/1", defaultIntegrations: false,
      beforeSend: createBeforeSend(), transport: () => ({
        send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; },
        flush: async () => true,
      }),
    });
    const limited = Response.json({ error: { code: -32029 } }, { status: 429, headers: { "Retry-After": "60" } });
    expect(await auditMcpRequest(request(), auth, async () => limited)).toBe(limited);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0]).outcome).toBe("denied");
    await Sentry.flush(2000);
    expect(envelopes).toHaveLength(0);
    await Sentry.withIsolationScope(async (scope) => {
      scope.setUser({ email: "private-email" });
      scope.setExtra("token", "private-token");
      scope.setContext("request", { body: "private-body" });
      scope.addBreadcrumb({ message: "private-breadcrumb" });
      const fail = async () => { throw new Error("private-error"); };
      await auditMcpRequest(request(), auth, fail);
      await auditMcpRequest(request("list_players"), auth, fail);
      await auditMcpRequest(request(), { ...auth, clientId: "client-b" }, fail);
      await auditMcpRequest(request(), auth, fail);
    });
    await Sentry.flush(2000);
    const serialized = JSON.stringify(envelopes);
    for (const secret of ["private-email", "private-token", "private-body", "private-breadcrumb", "private-error"]) {
      expect(serialized).not.toContain(secret);
    }
    const events = envelopes.flatMap((envelope) => (envelope as [unknown, [{ type: string }, unknown][]])[1])
      .filter(([header]) => header.type === "event").map(([, event]) => event);
    expect(events).toHaveLength(3);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ tags: { operation: "mcp-tool", tool: "list_groups", client: "client-a" } }),
      expect.objectContaining({ tags: { operation: "mcp-tool", tool: "list_players", client: "client-a" } }),
      expect.objectContaining({ tags: { operation: "mcp-tool", tool: "list_groups", client: "client-b" } }),
    ]));
  });
});
