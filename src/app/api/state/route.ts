import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { MatchSet } from "@/lib/types";
import { requireActiveMatch } from "../_token";
import { resolvePlayerNames } from "../_match";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireActiveMatch(request);
  if (auth instanceof Response) return auth;
  const { matchId } = auth;

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

  const nameById = await resolvePlayerNames(admin, [...team1Ids, ...team2Ids]);
  const resolveNames = (ids: string[]) => ids.map((id) => nameById.get(id) ?? "?");

  return Response.json({
    match: { id: matchId },
    sets,
    score: lastSet ? `${lastSet.team1Score}-${lastSet.team2Score}` : "0-0",
    setsSpoken: sets.map((s) => `${s.team1Score}-${s.team2Score}`).join(", "),
    team1: resolveNames(team1Ids),
    team2: resolveNames(team2Ids),
  });
}
