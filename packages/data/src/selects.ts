export const MATCH_EVENTS_GROUP_SELECT =
  "id, match_id, player_id, type, created_by, created_at, matches!inner(group_id)";

export const MATCH_VOTES_GROUP_SELECT =
  "id, match_id, voter_player_id, voted_for_player_id, vote_type, created_at, matches!inner(group_id)";
