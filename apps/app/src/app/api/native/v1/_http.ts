import type { SupabaseClient } from "@supabase/supabase-js";
import { nativeError, type NativeResult } from "@padelaso/data/native";
import type { NativeError } from "@padelaso/data/contracts";
import { createUserSupabaseClient } from "@/lib/supabase-user";

const STATUS: Record<NativeError["code"], number> = {
  INVALID_REQUEST: 400,
  UNSUPPORTED_VERSION: 400,
  AUTH_EXPIRED: 401,
  AUTH_STALE: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STALE_SESSION: 409,
  STALE_REVISION: 409,
  STALE_SET: 409,
  OUT_OF_ORDER: 409,
  COMMAND_ID_REUSED: 409,
  IN_FLIGHT: 409,
  COMMAND_EXPIRED: 410,
  INTERNAL_ERROR: 500,
};

export function nativeResponse<T>(result: NativeResult<T>): Response {
  if (result.ok) {
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  }
  const { error } = result;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error.retryAfterMs !== null) {
    headers["Retry-After"] = String(Math.ceil(error.retryAfterMs / 1000));
  }
  return Response.json(error, { status: STATUS[error.code], headers });
}

export function nativeFailure(code: NativeError["code"], message: string): Response {
  return nativeResponse({ ok: false, error: nativeError(code, message) });
}

/**
 * Builds a client that acts as the caller, so the database authorizes the user
 * rather than a service role. Tokens are only accepted from the header, never from
 * the URL, and Shortcut score tokens are not JWTs, so PostgREST rejects them.
 */
export function createNativeClient(request: Request): SupabaseClient | null {
  const header = request.headers.get("authorization");
  const accessToken = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!accessToken) return null;
  return createUserSupabaseClient(accessToken);
}
