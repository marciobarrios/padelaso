export type PlayerId = string;
export type MatchId = string;
export type MatchEventId = string;

export interface Player {
  id: PlayerId;
  name: string;
  emoji: string;
  createdAt: Date;
}

export interface MatchSet {
  team1Score: number;
  team2Score: number;
}

export interface Match {
  id: MatchId;
  date: Date;
  courtNumber?: number;
  team1: [PlayerId, PlayerId];
  team2: [PlayerId, PlayerId];
  sets: MatchSet[];
  createdAt: Date;
}

export interface MatchEvent {
  id: MatchEventId;
  matchId: MatchId;
  playerId: PlayerId;
  type: MatchEventType;
  createdAt: Date;
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
