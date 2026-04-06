import { createClient } from "./supabase";
import { PlayerId, MatchId, MatchSet, MatchEventType, MatchEventId, GroupId, Group, VoteType } from "./types";

const supabase = createClient();

// ---------- Groups ----------

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous I/1/O/0
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createGroup(
  name: string,
  emoji: string,
  userId: string
): Promise<Group> {
  const inviteCode = generateInviteCode();

  // Use RPC to atomically create the group + add creator as admin
  // This avoids RLS chicken-and-egg: SELECT policy on groups requires
  // membership, but membership doesn't exist until after insert
  const { data, error } = await supabase.rpc("create_group", {
    group_name: name,
    group_emoji: emoji,
    group_invite_code: inviteCode,
  });
  if (error) throw error;

  const g = data as Record<string, unknown>;
  return {
    id: g.id as string,
    name: g.name as string,
    emoji: g.emoji as string,
    inviteCode: g.invite_code as string,
    createdBy: g.created_by as string,
    createdAt: g.created_at as string,
  };
}

export async function joinGroupByCode(code: string): Promise<Group> {
  const { data, error } = await supabase.rpc("join_group_by_code", {
    code: code.toUpperCase().trim(),
  });
  if (error) throw error;
  const g = data as Record<string, unknown>;
  return {
    id: g.id as string,
    name: g.name as string,
    emoji: g.emoji as string,
    inviteCode: g.invite_code as string,
    createdBy: g.created_by as string,
    createdAt: g.created_at as string,
  };
}

export async function deleteGroup(groupId: GroupId) {
  const { error } = await supabase
    .from("groups")
    .delete()
    .eq("id", groupId);
  if (error) throw error;
}

export async function leaveGroup(groupId: GroupId, userId: string) {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function updateGroup(
  groupId: GroupId,
  data: { name?: string; emoji?: string }
) {
  const { error } = await supabase
    .from("groups")
    .update(data)
    .eq("id", groupId);
  if (error) throw error;
}

export async function regenerateInviteCode(groupId: GroupId): Promise<string> {
  const newCode = generateInviteCode();
  const { error } = await supabase
    .from("groups")
    .update({ invite_code: newCode })
    .eq("id", groupId);
  if (error) throw error;
  return newCode;
}

// ---------- Players ----------

export async function createPlayer(
  name: string,
  emoji: string,
  userId: string,
  groupId: GroupId
) {
  const { error } = await supabase.from("players").insert({
    name,
    emoji,
    created_by: userId,
    group_id: groupId,
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
  events: { playerId: PlayerId; type: MatchEventType }[] = [],
  groupId?: GroupId
) {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .insert({
      team1,
      team2,
      sets,
      created_by: userId,
      ...(groupId ? { group_id: groupId } : {}),
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

// ---------- Match Votes ----------

export async function castMatchVote(
  matchId: MatchId,
  voterPlayerId: PlayerId,
  votedForPlayerId: PlayerId,
  voteType: VoteType
) {
  const { error } = await supabase.from("match_votes").upsert(
    {
      match_id: matchId,
      voter_player_id: voterPlayerId,
      voted_for_player_id: votedForPlayerId,
      vote_type: voteType,
    },
    { onConflict: "match_id,voter_player_id,vote_type" }
  );
  if (error) throw error;
}

export async function removeMatchVote(
  matchId: MatchId,
  voterPlayerId: PlayerId,
  voteType: VoteType
) {
  const { error } = await supabase
    .from("match_votes")
    .delete()
    .eq("match_id", matchId)
    .eq("voter_player_id", voterPlayerId)
    .eq("vote_type", voteType);
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

export async function unlinkPlayerFromUser(
  playerId: PlayerId,
  userId: string
) {
  // Clear user_id on the player
  const { error: playerError } = await supabase
    .from("players")
    .update({ user_id: null })
    .eq("id", playerId);
  if (playerError) throw playerError;

  // Clear player_id on the profile
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ player_id: null })
    .eq("id", userId);
  if (profileError) throw profileError;
}
