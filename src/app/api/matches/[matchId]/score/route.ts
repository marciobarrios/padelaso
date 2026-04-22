import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { MatchSet } from "@/lib/types";
import { applyScoreDelta } from "@/lib/utils";
import { extractToken, verifyScoreToken } from "../_token";

export const runtime = "nodejs";

interface ScoreRequestBody {
  team?: 1 | 2;
  delta?: number;
  newSet?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;

  const token = extractToken(request);
  const verified = await verifyScoreToken(matchId, token);
  if (!verified) {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  let body: ScoreRequestBody;
  try {
    body = (await request.json()) as ScoreRequestBody;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const team = body.team;
  const delta = body.delta ?? 1;
  if (team !== 1 && team !== 2) {
    return Response.json({ error: "team must be 1 or 2" }, { status: 400 });
  }
  if (!Number.isFinite(delta) || delta < -10 || delta > 10) {
    return Response.json({ error: "delta must be between -10 and 10" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: match } = await admin
    .from("matches")
    .select("sets")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  const currentSets: MatchSet[] = Array.isArray(match.sets) ? (match.sets as MatchSet[]) : [];
  const withNewSet = body.newSet
    ? [...currentSets, { team1Score: 0, team2Score: 0 }]
    : currentSets;
  const updatedSets = applyScoreDelta(withNewSet, team, delta);

  const { error } = await admin
    .from("matches")
    .update({ sets: updatedSets })
    .eq("id", matchId);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const last = updatedSets[updatedSets.length - 1];
  return Response.json({
    sets: updatedSets,
    score: `${last.team1Score}-${last.team2Score}`,
    setsSpoken: updatedSets
      .map((s) => `${s.team1Score}-${s.team2Score}`)
      .join(", "),
  });
}
