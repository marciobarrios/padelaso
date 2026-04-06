import { MatchEventType, VoteType } from "./types";

export interface EventConfig {
  type: MatchEventType;
  emoji: string;
  label: string;
  sentiment: "positive" | "negative" | "fun";
}

export interface VoteConfig {
  type: VoteType;
  emoji: string;
  label: string;
}

export const VOTE_CONFIGS: VoteConfig[] = [
  { type: "mvp", emoji: "🏆", label: "MVP" },
  { type: "jugada_del_partido", emoji: "⭐", label: "Jugada del partido" },
];

export const EVENT_CONFIGS: EventConfig[] = [
  { type: "bola_fuera", emoji: "🚀", label: "Bola fuera", sentiment: "negative" },
  { type: "pelotazo", emoji: "💥", label: "Pelotazo al rival", sentiment: "negative" },
  { type: "bola_perdida", emoji: "🫠", label: "Bola perdida", sentiment: "negative" },
  { type: "ace", emoji: "🎯", label: "Ace", sentiment: "positive" },
  { type: "vibora", emoji: "🐍", label: "Víbora letal", sentiment: "positive" },
  { type: "bandeja", emoji: "🍳", label: "Bandeja maestra", sentiment: "positive" },
  { type: "globo", emoji: "🎈", label: "Globo perfecto", sentiment: "positive" },
  { type: "bajada_muro", emoji: "🧱", label: "Bajada de muro", sentiment: "positive" },
  { type: "doble_falta", emoji: "❌", label: "Doble falta", sentiment: "negative" },
  { type: "puntazo", emoji: "⭐", label: "Puntazo", sentiment: "positive" },
  { type: "caida_epica", emoji: "🤸", label: "Caída épica", sentiment: "negative" },
  { type: "grito_guerra", emoji: "🗣️", label: "Grito de guerra", sentiment: "fun" },
  { type: "raquetazo_cristal", emoji: "😤", label: "Raquetazo al cristal", sentiment: "negative" },
  { type: "por_la_puerta", emoji: "🚪", label: "Por la puerta", sentiment: "positive" },
  { type: "tomahawk", emoji: "☄️", label: "Misil al cristal", sentiment: "negative" },
  { type: "tocaste_techo", emoji: "🏠", label: "Has tocado techo", sentiment: "fun" },
  { type: "por_3_metros", emoji: "🤯", label: "Por 3 metros", sentiment: "positive" },
  { type: "remate_red", emoji: "🕸️", label: "Remate a la red", sentiment: "negative" },
  { type: "cano", emoji: "⚽", label: "Caño", sentiment: "fun" },
  { type: "dejada_imposible", emoji: "🪦", label: "Dejada imposible", sentiment: "positive" },
  { type: "cinta", emoji: "🍀", label: "Punto gracias a la red", sentiment: "fun" },
  { type: "chiquita", emoji: "🥷", label: "Chiquita letal", sentiment: "positive" },
  { type: "golpe_tapia", emoji: "🪄", label: "Golpe Tapia", sentiment: "positive" },
  { type: "salvada_top", emoji: "🦸", label: "Salvada top", sentiment: "positive" },
];

export const EVENT_MAP = new Map(EVENT_CONFIGS.map((e) => [e.type, e]));

export function getEventConfig(type: MatchEventType): EventConfig {
  return EVENT_MAP.get(type)!;
}
