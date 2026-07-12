import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { EVENT_CONFIGS, getEventConfig } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import { requireActiveMatch } from "../_token";
import { fetchMatchRoster } from "../_match";
import { resolveEventQuery } from "./_resolve";

const VALID_EVENT_TYPES = new Set<string>(EVENT_CONFIGS.map((e) => e.type));

type ResolveErrorCode =
  | "no_event"
  | "no_player"
  | "ambiguous_event"
  | "ambiguous_player";

function spokenForResolveError(code: ResolveErrorCode): string {
  switch (code) {
    case "no_event":
      return "No reconocí ningún evento. Repite la frase.";
    case "no_player":
      return "No encontré al jugador en este partido.";
    case "ambiguous_event":
      return "Hay varios eventos posibles, sé más específico.";
    case "ambiguous_player":
      return "Hay varios jugadores posibles, dilo con apellido.";
  }
}

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
    return Response.json(
      { error: "Body must be JSON", spoken: "Cuerpo de la petición no válido." },
      { status: 400 }
    );
  }

  const { playerId, type, query } = body;
  const admin = createAdminSupabaseClient();

  // Voice-driven path: resolve a free-form phrase against the roster + vocabulary.
  if (typeof query === "string" && query.trim() !== "" && (!playerId || !type)) {
    const roster = await fetchMatchRoster(admin, matchId);
    if (!roster) {
      return Response.json(
        { error: "Match not found", spoken: "Partido no encontrado." },
        { status: 404 }
      );
    }
    const result = resolveEventQuery(query, roster.players, verified.createdBy);
    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          understood: result.understood,
          spoken: spokenForResolveError(result.error),
        },
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
      return Response.json(
        { error: error.message, spoken: "Error al guardar el evento." },
        { status: 500 }
      );
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
      {
        error: "playerId and type are required",
        spoken: "Faltan datos del evento.",
      },
      { status: 400 }
    );
  }
  if (!VALID_EVENT_TYPES.has(type)) {
    return Response.json(
      {
        error: `Unknown event type: ${type}`,
        spoken: "Tipo de evento desconocido.",
      },
      { status: 400 }
    );
  }

  const roster = await fetchMatchRoster(admin, matchId);
  if (!roster) {
    return Response.json(
      { error: "Match not found", spoken: "Partido no encontrado." },
      { status: 404 }
    );
  }
  const matchPlayers = new Set<string>([...roster.team1Ids, ...roster.team2Ids]);
  if (!matchPlayers.has(playerId)) {
    return Response.json(
      {
        error: "playerId is not part of this match",
        spoken: "El jugador no está en este partido.",
      },
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
    return Response.json(
      { error: error.message, spoken: "Error al guardar el evento." },
      { status: 500 }
    );
  }

  const playerName =
    roster.players.find((p) => p.id === playerId)?.name ?? "el jugador";
  const eventLabel = getEventConfig(type).label;

  return Response.json({
    match: { id: matchId },
    id: inserted.id,
    type,
    playerId,
    playerName,
    eventLabel,
    spoken: `${eventLabel} para ${playerName}`,
  });
}
