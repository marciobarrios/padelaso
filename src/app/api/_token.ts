import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export interface VerifiedToken {
  token: string;
  createdBy: string;
  currentMatchId: string | null;
}

export async function verifyTokenAndGetMatch(
  token: string | null
): Promise<VerifiedToken | null> {
  if (!token) return null;
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("score_tokens")
    .select("token, created_by, current_match_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return {
    token: data.token as string,
    createdBy: data.created_by as string,
    currentMatchId: (data.current_match_id as string | null) ?? null,
  };
}

export function extractToken(request: Request): string | null {
  const url = new URL(request.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export interface ActiveMatchAuth {
  verified: VerifiedToken;
  matchId: string;
}

export async function requireActiveMatch(
  request: Request
): Promise<ActiveMatchAuth | Response> {
  const token = extractToken(request);
  const verified = await verifyTokenAndGetMatch(token);
  if (!verified) {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 });
  }
  if (!verified.currentMatchId) {
    return Response.json({ error: "No hay partido activo" }, { status: 409 });
  }
  return { verified, matchId: verified.currentMatchId };
}
