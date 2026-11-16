import * as Sentry from "@sentry/nextjs";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createUserSupabaseClient } from "@/lib/supabase-user";

/** Requests per minute for one user through one OAuth client. */
export const DEFAULT_CLIENT_LIMIT = 60;
/** Requests per minute for one user across all their clients. */
export const DEFAULT_USER_LIMIT = 120;

export interface McpRateLimits {
  perClient: number;
  perUser: number;
}

function limitFrom(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** `MCP_RATE_LIMIT_PER_CLIENT` and `MCP_RATE_LIMIT_PER_USER`, requests per minute. */
export function getMcpRateLimits(): McpRateLimits {
  return {
    perClient: limitFrom(process.env.MCP_RATE_LIMIT_PER_CLIENT, DEFAULT_CLIENT_LIMIT),
    perUser: limitFrom(process.env.MCP_RATE_LIMIT_PER_USER, DEFAULT_USER_LIMIT),
  };
}

const hitSchema = z.object({
  client_requests: z.number().int(),
  user_requests: z.number().int(),
  retry_after: z.number().int().positive(),
});

/**
 * Counts the request against the caller's budgets (`public.hit_mcp_rate_limit`)
 * and returns how many seconds to wait when either is spent, or `null` to go on.
 *
 * Fails open: if the counter can't be reached the request runs, because the
 * tools need the same database and will report the outage themselves.
 */
export async function checkMcpRateLimit(authInfo: AuthInfo): Promise<number | null> {
  const { data, error } = await createUserSupabaseClient(authInfo.token).rpc("hit_mcp_rate_limit");
  const hit = hitSchema.safeParse(data);
  if (error || !hit.success) {
    Sentry.captureException(error ?? hit.error, { tags: { operation: "mcp-rate-limit" } });
    return null;
  }
  const limits = getMcpRateLimits();
  const { client_requests, user_requests, retry_after } = hit.data;
  return client_requests > limits.perClient || user_requests > limits.perUser ? retry_after : null;
}

/**
 * HTTP 429 with `Retry-After`, and a JSON-RPC error body so clients that only
 * read the body still see why. The tool never runs.
 */
export function rateLimitedResponse(retryAfter: number): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32029,
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        data: { retryAfter },
      },
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
