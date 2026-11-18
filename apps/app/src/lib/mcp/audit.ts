import { AsyncLocalStorage } from "node:async_hooks";
import * as Sentry from "@sentry/nextjs";
import type { AuthInfo } from "@modelcontextprotocol/server";

export const toolAudit = new AsyncLocalStorage<{ outcome: "ok" | "denied" | "error" }>();
const names = new Set(["list_groups", "list_players", "list_matches", "get_match", "get_player_stats", "create_match", "add_match_events", "remove_match_event"]);

/** Outside SDK wire/input/output validation; auth has already verified the caller. */
export async function auditMcpRequest(request: Request, auth: AuthInfo | undefined,
  dispatch: (request: Request) => Promise<Response>): Promise<Response> {
  if (request.method !== "POST") return dispatch(request);
  const body = await request.clone().json().catch(() => null);
  if (body?.method !== "tools/call") return dispatch(request);
  // Names supplied for unknown tools may themselves contain sensitive data.
  const tool = names.has(body.params?.name) ? body.params.name as string : "unknown";
  const started = performance.now();
  const state = { outcome: "ok" as "ok" | "denied" | "error" };
  return toolAudit.run(state, async () => {
    try {
      const response = await dispatch(request);
      try {
        const text = await response.clone().text();
        const data = response.headers.get("content-type")?.includes("text/event-stream")
          ? text.split("\n").filter((line) => line.startsWith("data: ")).at(-1)?.slice(6) : text;
        const message = JSON.parse(data ?? "null");
        if (state.outcome === "ok") {
          if (message?.error) state.outcome = response.status === 429 || message.error.code === -32602 ? "denied" : "error";
          else if (message?.result?.isError) {
            const content = message.result.content?.[0];
            state.outcome = content?.type === "text" && content.text.startsWith("Input validation error:") ? "denied" : "error";
          } else if (!message?.result || !response.ok) state.outcome = "error";
        }
      } catch {
        // Observability must never replace a successful tool response.
        state.outcome = "error";
      }
      return response;
    } catch {
      state.outcome = "error";
      return Response.json({ jsonrpc: "2.0", id: body.id ?? null,
        error: { code: -32603, message: "MCP tool unavailable" } });
    } finally {
      if (state.outcome === "error") {
        // Raw failures and inherited request context may contain payloads.
        Sentry.withScope((scope) => {
          scope.clear();
          scope.addEventProcessor((event) => ({ event_id: event.event_id, timestamp: event.timestamp,
            platform: event.platform, level: event.level, exception: event.exception,
            fingerprint: ["mcp-tool", tool, auth?.clientId ?? "unknown"],
            tags: { operation: "mcp-tool", tool, client: auth?.clientId ?? "unknown" } }));
          Sentry.captureException(new Error("MCP tool failed"), {
            tags: { operation: "mcp-tool", tool, client: auth?.clientId ?? "unknown" },
          });
        });
      }
      console.info(JSON.stringify({ event: "mcp-tool-call", userId: auth?.extra?.userId ?? null,
        clientId: auth?.clientId ?? null, tool, outcome: state.outcome,
        durationMs: Math.round(performance.now() - started) }));
    }
  });
}
