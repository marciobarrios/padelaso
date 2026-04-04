export type PlayerId = string;
export type MatchId = string;
export type MatchEventId = string;

export interface Player {
  id: PlayerId;
  name: string;
  emoji: string;
  userId?: string | null;
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
  | "mvp"
  | "bola_fuera"
  | "jugada_destacada"
  | "pelotazo"
  | "bola_perdida"
  | "ace"
  | "vibora"
  | "bandeja"
  | "globo"
  | "bajada_muro"
  | "doble_falta"
  | "punto_oro"
  | "caida_epica"
  | "grito_guerra"
  | "raquetazo_cristal"
  | "por_la_puerta"
  | "hacer_souhel";

export interface Profile {
  id: string;
  playerId?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  createdAt: string;
}
