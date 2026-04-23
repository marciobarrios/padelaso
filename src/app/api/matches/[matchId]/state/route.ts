import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { MatchSet } from "@/lib/types";
import { extractToken, verifyScoreToken } from "../_token";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;

  const token = extractToken(request);
  const verified = await verifyScoreToken(matchId, token);
  if (!verified) {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: match } = await admin
    .from("matches")
    .select("team1, team2, sets")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  const sets: MatchSet[] = Array.isArray(match.sets) ? (match.sets as MatchSet[]) : [];
  const lastSet = sets[sets.length - 1];
  const team1Ids = match.team1 as string[];
  const team2Ids = match.team2 as string[];

  const { data: players } = await admin
    .from("players")
    .select("id, name")
    .in("id", [...team1Ids, ...team2Ids]);

  const nameById = new Map<string, string>(
    (players ?? []).map((p) => [p.id as string, p.name as string])
  );
  const resolveNames = (ids: string[]) => ids.map((id) => nameById.get(id) ?? "?");

  return Response.json({
    sets,
    score: lastSet ? `${lastSet.team1Score}-${lastSet.team2Score}` : "0-0",
    setsSpoken: sets.map((s) => `${s.team1Score}-${s.team2Score}`).join(", "),
    team1: resolveNames(team1Ids),
    team2: resolveNames(team2Ids),
  });
}
