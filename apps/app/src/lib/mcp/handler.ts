import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { bearerAuthChallengeResponse, OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listMcpMatches, listMcpGroups, listMcpPlayers } from "@padelaso/data/queries";
import { calculatePlayerStats } from "@padelaso/domain/stats";
import { createNativeClient } from "@/app/api/native/v1/_http";
import { mcpConfig, verifyMcpToken } from "./auth";

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const groupId = z.uuid();
const groupTools = new Set(["list_players", "list_matches", "get_player_stats"]);
const result = (data: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data,
});

export async function handleMcp(request: Request) {
  const { origin } = mcpConfig();
  const handler = withMcpAuth(async (authenticated) => {
    const client = createNativeClient(authenticated)!;
    let sdkRequest = authenticated;
    // HTTP authorization happens outside the SDK tool callback, so forbidden
    // group requests receive a real 403 and RFC 9728 challenge, not a tool error.
    if (authenticated.method === "POST") {
      // Bound the authorization preflight too, before the SDK's own body limit.
      const reader = authenticated.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            return Response.json({ error: "Request too large" }, { status: 413 });
          }
          chunks.push(value);
        }
      }
      const bytes = Buffer.concat(chunks);
      sdkRequest = new Request(authenticated.url, {
        method: authenticated.method, headers: authenticated.headers, body: bytes, signal: authenticated.signal,
      });
      sdkRequest.auth = authenticated.auth;
      let body;
      try { body = JSON.parse(bytes.toString("utf8")); } catch { /* SDK reports malformed JSON. */ }
      if (body?.method === "tools/call" && groupTools.has(body.params?.name)) {
        const parsed = groupId.safeParse(body.params?.arguments?.group_id);
        if (parsed.success) {
          const { data, error } = await client.from("group_members").select("group_id")
            .eq("group_id", parsed.data).eq("user_id", authenticated.auth!.extra!.userId as string).maybeSingle();
          if (error) return Response.json({ error: "Unable to check group access" }, { status: 503 });
          if (!data) return bearerAuthChallengeResponse(
            new OAuthError(OAuthErrorCode.InsufficientScope, "Group access denied"),
            { resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource` },
          );
        }
      }
    }
    const mcp = createMcpHandler((server) => {
      const safe = (run: () => Promise<Record<string, unknown>>) => async () => {
        try { return result(await run()); }
        catch { return { isError: true, content: [{ type: "text" as const, text: "Unable to read Padelaso data. Please try again." }] }; }
      };
      server.registerTool("list_groups", {
        description: "List the groups you belong to.", inputSchema: z.object({}), annotations,
      }, safe(async () => ({ groups: await listMcpGroups(client) })));
      server.registerTool("list_players", {
        description: "Resolve player names within one of your groups. Name is a literal substring.",
        inputSchema: z.object({ group_id: groupId, name: z.string().trim().max(100).optional() }), annotations,
      }, async ({ group_id, name }) => safe(async () => ({ players: await listMcpPlayers(client, group_id, name) }))());
      server.registerTool("list_matches", {
        description: "List a group's match history, newest first. Use offset for more results.",
        inputSchema: z.object({ group_id: groupId, limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(10000).default(0) }), annotations,
      }, async ({ group_id, limit, offset }) => safe(async () => {
        const matches = await listMcpMatches(client, group_id);
        return { matches: matches.slice(offset, offset + limit).map(({ id, date, courtNumber, team1, team2, sets, groupId }) => ({ id, date, courtNumber, team1, team2, sets, groupId })), next_offset: offset + limit < matches.length ? offset + limit : null };
      })());
      server.registerTool("get_player_stats", {
        description: "Calculate a player's stats using the group's match history and Padelaso scoring rules.",
        inputSchema: z.object({ group_id: groupId, player_id: z.uuid() }), annotations,
      }, async ({ group_id, player_id }) => safe(async () => {
        const players = await listMcpPlayers(client, group_id);
        if (!players.some((player) => player.id === player_id)) return { error: "Player not found in this group" };
        return { stats: calculatePlayerStats(player_id, await listMcpMatches(client, group_id)) };
      })());
    }, { serverInfo: { name: "padelaso", version: "1.0.0" } });
    return mcp(sdkRequest);
  }, verifyMcpToken, { required: true, resourceUrl: origin });
  const response = await handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
