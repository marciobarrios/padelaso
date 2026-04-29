export type PlayerId = string;
export type MatchId = string;
export type MatchEventId = string;
export type MatchVoteId = string;
export type GroupId = string;

export interface Group {
  id: GroupId;
  name: string;
  emoji: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string | Date;
}

export interface GroupMember {
  groupId: GroupId;
  userId: string;
  role: "admin" | "member";
  joinedAt: string | Date;
}

export interface Player {
  id: PlayerId;
  name: string;
  emoji: string;
  userId?: string | null;
  groupId: GroupId;
  createdBy?: string;
  createdAt: string | Date;
}

export interface MatchSet {
  team1Score: number;
  team2Score: number;
}

export interface Match {
  id: MatchId;
  date: string | Date;
  courtNumber?: number | null;
  team1: PlayerId[];
  team2: PlayerId[];
  sets: MatchSet[];
  groupId: GroupId;
  createdBy?: string;
  createdAt: string | Date;
}

export interface MatchEvent {
  id: MatchEventId;
  matchId: MatchId;
  playerId: PlayerId;
  type: MatchEventType;
  createdBy?: string;
  createdAt: string | Date;
}

export type MatchEventType =
  | "bola_fuera"
  | "pelotazo"
  | "bola_perdida"
  | "ace"
  | "vibora"
  | "bandeja"
  | "globo"
  | "bajada_muro"
  | "doble_falta"
  | "puntazo"
  | "caida_epica"
  | "grito_guerra"
  | "raquetazo_cristal"
  | "por_la_puerta"
  | "tomahawk"
  | "tocaste_techo"
  | "por_3_metros"
  | "remate_red"
  | "cano"
  | "dejada_imposible"
  | "cinta"
  | "chiquita"
  | "golpe_tapia"
  | "salvada_top"
  | "raquetazo_companero"
  | "por_debajo_piernas";

export type VoteType = "mvp" | "jugada_del_partido";

export interface MatchVote {
  id: MatchVoteId;
  matchId: MatchId;
  voterPlayerId: PlayerId;
  votedForPlayerId: PlayerId;
  voteType: VoteType;
  createdAt: string | Date;
}

export interface Profile {
  id: string;
  playerId?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface ScoreToken {
  token: string;
  currentMatchId: MatchId | null;
  expiresAt: string;
  createdAt: string;
  rotatedAt: string | null;
}
