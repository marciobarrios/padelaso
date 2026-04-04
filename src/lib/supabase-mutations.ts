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
  // Remove this player from any match team arrays (no FK cascade for array elements)
  const { data: matches } = await supabase
    .from("matches")
    .select("id, team1, team2")
    .or(`team1.cs.{${playerId}},team2.cs.{${playerId}}`);

  if (matches) {
    for (const match of matches) {
      const updates: Record<string, PlayerId[]> = {};
      if ((match.team1 as PlayerId[]).includes(playerId)) {
        updates.team1 = (match.team1 as PlayerId[]).filter((id) => id !== playerId);
      }
      if ((match.team2 as PlayerId[]).includes(playerId)) {
        updates.team2 = (match.team2 as PlayerId[]).filter((id) => id !== playerId);
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("matches").update(updates).eq("id", match.id);
      }
    }
  }

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
  // Set user_id on the player — verify the row was actually updated
  const { data: updatedPlayer, error: playerError } = await supabase
    .from("players")
    .update({ user_id: userId })
    .eq("id", playerId)
    .select("id");
  if (playerError) throw playerError;
  if (!updatedPlayer || updatedPlayer.length === 0) {
    throw new Error("Failed to link player: update was not applied");
  }

  // Set player_id on the profile
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ player_id: playerId })
    .eq("id", userId);
  if (profileError) throw profileError;
}
