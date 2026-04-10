import { Player, Match, MatchEvent, MatchVote, Group, GroupMember } from "./types";

export function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    userId: (row.user_id as string) ?? null,
    groupId: row.group_id as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

export function mapMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    date: row.date as string,
    courtNumber: (row.court_number as number) ?? null,
    team1: row.team1 as string[],
    team2: row.team2 as string[],
    sets: row.sets as Match["sets"],
    groupId: row.group_id as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

export function mapMatchEvent(row: Record<string, unknown>): MatchEvent {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    playerId: row.player_id as string,
    type: row.type as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  } as MatchEvent;
}

export function mapGroup(row: Record<string, unknown>): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    inviteCode: row.invite_code as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

export function mapMatchVote(row: Record<string, unknown>): MatchVote {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    voterPlayerId: row.voter_player_id as string,
    votedForPlayerId: row.voted_for_player_id as string,
    voteType: row.vote_type as string,
    createdAt: row.created_at as string,
  } as MatchVote;
}

export function mapGroupMember(row: Record<string, unknown>): GroupMember {
  return {
    groupId: row.group_id as string,
    userId: row.user_id as string,
    role: row.role as "admin" | "member",
    joinedAt: row.joined_at as string,
  };
}
