import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { EVENT_CONFIGS } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import { requireActiveMatch } from "../_token";
import { fetchMatchTeams, fetchMatchRoster } from "../_match";
import { resolveEventQuery } from "./_resolve";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = new Set<string>(EVENT_CONFIGS.map((e) => e.type));

interface EventRequestBody {
  playerId?: string;
  type?: MatchEventType;
  query?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveMatch(request);
  if (auth instanceof Response) return auth;
  const { verified, matchId } = auth;

  let body: EventRequestBody;
  try {
    body = (await request.json()) as EventRequestBody;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { playerId, type, query } = body;
  const admin = createAdminSupabaseClient();

  // Voice-driven path: resolve a free-form phrase against the roster + vocabulary.
  if (typeof query === "string" && query.trim() !== "" && (!playerId || !type)) {
    const roster = await fetchMatchRoster(admin, matchId);
    if (!roster) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }
    const result = resolveEventQuery(query, roster.players, verified.createdBy);
    if (!result.ok) {
      return Response.json(
        { error: result.error, understood: result.understood },
        { status: 400 }
      );
    }

    const { data: inserted, error } = await admin
      .from("match_events")
      .insert({
        match_id: matchId,
        player_id: result.playerId,
        type: result.type,
        created_by: verified.createdBy,
      })
      .select("id")
      .single();
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      match: { id: matchId },
      id: inserted.id,
      type: result.type,
      playerId: result.playerId,
      playerName: result.playerName,
      eventLabel: result.eventLabel,
      spoken: `${result.eventLabel} para ${result.playerName}`,
    });
  }

  // Legacy path: explicit playerId + type.
  if (!playerId || !type) {
    return Response.json(
      { error: "playerId and type are required" },
      { status: 400 }
    );
  }
  if (!VALID_EVENT_TYPES.has(type)) {
    return Response.json({ error: `Unknown event type: ${type}` }, { status: 400 });
  }

  const teams = await fetchMatchTeams(admin, matchId);
  if (!teams) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }
  const matchPlayers = new Set<string>([...teams.team1Ids, ...teams.team2Ids]);
  if (!matchPlayers.has(playerId)) {
    return Response.json(
      { error: "playerId is not part of this match" },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await admin
    .from("match_events")
    .insert({
      match_id: matchId,
      player_id: playerId,
      type,
      created_by: verified.createdBy,
    })
    .select("id")
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    match: { id: matchId },
    id: inserted.id,
    type,
    playerId,
  });
}
