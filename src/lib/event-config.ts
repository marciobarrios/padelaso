import { MatchEventType } from "./types";

export interface EventConfig {
  type: MatchEventType;
  emoji: string;
  label: string;
  sentiment: "positive" | "negative" | "fun";
}

export const EVENT_CONFIGS: EventConfig[] = [
  { type: "mvp", emoji: "🏆", label: "MVP", sentiment: "positive" },
  { type: "bola_fuera", emoji: "🚀", label: "Bola fuera", sentiment: "negative" },
  { type: "jugada_destacada", emoji: "🔥", label: "Jugada destacada", sentiment: "positive" },
  { type: "pelotazo", emoji: "💥", label: "Pelotazo al rival", sentiment: "negative" },
  { type: "bola_perdida", emoji: "🫠", label: "Bola perdida", sentiment: "negative" },
  { type: "ace", emoji: "🎯", label: "Ace", sentiment: "positive" },
  { type: "vibora", emoji: "🐍", label: "Víbora letal", sentiment: "positive" },
  { type: "bandeja", emoji: "🍳", label: "Bandeja maestra", sentiment: "positive" },
  { type: "globo", emoji: "🎈", label: "Globo perfecto", sentiment: "positive" },
  { type: "bajada_muro", emoji: "🧱", label: "Bajada de muro", sentiment: "positive" },
  { type: "doble_falta", emoji: "❌", label: "Doble falta", sentiment: "negative" },
  { type: "punto_oro", emoji: "⭐", label: "Punto de oro", sentiment: "positive" },
  { type: "caida_epica", emoji: "🤸", label: "Caída épica", sentiment: "negative" },
  { type: "grito_guerra", emoji: "🗣️", label: "Grito de guerra", sentiment: "fun" },
  { type: "raquetazo_cristal", emoji: "😤", label: "Raquetazo al cristal", sentiment: "negative" },
  { type: "por_la_puerta", emoji: "🚪", label: "Por la puerta", sentiment: "positive" },
  { type: "hacer_souhel", emoji: "🪩", label: "Hacer un Souhel", sentiment: "fun" },
];

export const EVENT_MAP = new Map(EVENT_CONFIGS.map((e) => [e.type, e]));

export function getEventConfig(type: MatchEventType): EventConfig {
  return EVENT_MAP.get(type)!;
}
