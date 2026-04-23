import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export interface VerifiedToken {
  matchId: string;
  createdBy: string;
}

export async function verifyScoreToken(
  matchId: string,
  token: string | null
): Promise<VerifiedToken | null> {
  if (!token) return null;
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("match_score_tokens")
    .select("match_id, created_by, expires_at")
    .eq("token", token)
    .eq("match_id", matchId)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return {
    matchId: data.match_id as string,
    createdBy: data.created_by as string,
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
