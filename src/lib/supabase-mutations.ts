import { createClient } from "./supabase";
import { PlayerId, MatchId, MatchSet, MatchEventType, MatchEventId } from "./types";

const supabase = createClient();

// ---------- Players ----------

export async function createPlayer(
  name: string,
  emoji: string,
  userId: string
) {
  const { error } = await supabase.from("players").insert({
    name,
    emoji,
    created_by: userId,
  });
  if (error) throw error;
}

export async function updatePlayer(
  playerId: PlayerId,
  data: { name?: string; emoji?: string }
) {
  const { error } = await supabase
    .from("players")
    .update(data)
    .eq("id", playerId);
  if (error) throw error;
}

export async function deletePlayer(playerId: PlayerId) {
  // match_events with this player_id will cascade delete via FK
  const { error } = await supabase
    .from("players")
    .delete()
    .eq("id", playerId);
  if (error) throw error;
}

// ---------- Matches ----------

export async function createMatch(
  team1: PlayerId[],
  team2: PlayerId[],
  sets: MatchSet[],
  userId: string,
  events: { playerId: PlayerId; type: MatchEventType }[] = []
) {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .insert({
      team1,
      team2,
      sets,
      created_by: userId,
    })
    .select("id")
    .single();
  if (matchError) throw matchError;

  if (events.length > 0) {
    const { error: eventsError } = await supabase
      .from("match_events")
      .insert(
        events.map((e) => ({
          match_id: match.id,
          player_id: e.playerId,
          type: e.type,
          created_by: userId,
        }))
      );
    if (eventsError) throw eventsError;
  }

  return match.id as string;
}

export async function updateMatch(
  matchId: MatchId,
  data: { sets?: MatchSet[] }
) {
  const { error } = await supabase
    .from("matches")
    .update(data)
    .eq("id", matchId);
  if (error) throw error;
}

export async function deleteMatch(matchId: MatchId) {
  // match_events will cascade delete via FK
  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId);
  if (error) throw error;
}

// ---------- Match Events ----------

export async function addMatchEvent(
  matchId: MatchId,
  playerId: PlayerId,
  type: MatchEventType,
  userId: string
) {
  const { error } = await supabase.from("match_events").insert({
    match_id: matchId,
    player_id: playerId,
    type,
    created_by: userId,
  });
  if (error) throw error;
}

export async function removeMatchEvent(eventId: MatchEventId) {
  const { error } = await supabase
    .from("match_events")
    .delete()
    .eq("id", eventId);
  if (error) throw error;
}

// ---------- Player-Account Linking ----------

export async function linkPlayerToUser(
  playerId: PlayerId,
  userId: string
) {
  // Set user_id on the player
  const { error: playerError } = await supabase
    .from("players")
    .update({ user_id: userId })
    .eq("id", playerId);
  if (playerError) throw playerError;

  // Set player_id on the profile
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ player_id: playerId })
    .eq("id", userId);
  if (profileError) throw profileError;
}
