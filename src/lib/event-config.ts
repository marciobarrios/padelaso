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
  { type: "globo", emoji: "🎈", label: "Globo perfecto", sentiment: "positive" },
  { type: "bajada_muro", emoji: "🧱", label: "Bajada de muro", sentiment: "positive" },
  { type: "doble_falta", emoji: "❌", label: "Doble falta", sentiment: "negative" },
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
  { type: "salvada_top", emoji: "🦸", label: "Salvada top", sentiment: "positive" },
  { type: "raquetazo_companero", emoji: "🏓", label: "Raquetazo al compañero", sentiment: "fun" },
  { type: "por_debajo_piernas", emoji: "🦵🏽", label: "Por debajo de las piernas", sentiment: "positive" },
  { type: "remontada", emoji: "🔄", label: "Remontada épica", sentiment: "positive" },
  { type: "set_perfecto", emoji: "💎", label: "Set perfecto", sentiment: "positive" },
  { type: "remate", emoji: "💣", label: "Remate imparable", sentiment: "positive" },
  { type: "magic", emoji: "✨", label: "Punto mágico", sentiment: "fun" },
];

export const EVENT_MAP = new Map(EVENT_CONFIGS.map((e) => [e.type, e]));

export function getEventConfig(type: MatchEventType): EventConfig {
  return (
    EVENT_MAP.get(type) ?? {
      type,
      emoji: "❓",
      label: type,
      sentiment: "fun",
    }
  );
}

export interface FunAwardConfig {
  emoji: string;
  title: string;
  events: MatchEventType[];
}

export const FUN_AWARD_CONFIGS: FunAwardConfig[] = [
  { emoji: "🧱", title: "El Muro", events: ["bajada_muro", "salvada_top"] },
  { emoji: "🗣️", title: "El Showman", events: ["grito_guerra", "caida_epica"] },
  { emoji: "🫠", title: "Manos de Mantequilla", events: ["bola_perdida", "bola_fuera"] },
  { emoji: "🎯", title: "El Sniper", events: ["ace", "dejada_imposible"] },
  { emoji: "🪄", title: "El Tapia", events: ["por_3_metros", "bajada_muro"] },
  { emoji: "⚡", title: "Vikingo", events: ["grito_guerra", "tomahawk"] },
  { emoji: "🤞🏽", title: "El Suertudo", events: ["cinta", "ace"] },
  { emoji: "⚽", title: "Ronaldinho", events: ["por_debajo_piernas", "cano"] },
  { emoji: "🪓", title: "El Killer", events: ["raquetazo_companero", "tomahawk"] },
  { emoji: "🔫", title: "El Francotirador", events: ["ace", "ace"] },
  { emoji: "🚫", title: "El Faltón", events: ["doble_falta", "doble_falta"] },
  { emoji: "🦎", title: "El Acróbata", events: ["caida_epica", "salvada_top"] },
  { emoji: "🧨", title: "El Destructivo", events: ["tomahawk", "raquetazo_cristal"] },
  { emoji: "🎩", title: "El Mago", events: ["cano", "dejada_imposible"] },
  { emoji: "🤕", title: "El Suicida", events: ["remate_red", "caida_epica"] },
  { emoji: "🏗️", title: "La Pared Humana", events: ["bajada_muro", "bajada_muro"] },
  { emoji: "🐍", title: "La Víbora", events: ["vibora", "chiquita"] },
  { emoji: "🔨", title: "El Cañonero", events: ["pelotazo", "por_la_puerta"] },
  { emoji: "🎱", title: "La Ruleta", events: ["cano", "cinta", "tocaste_techo"] },
  { emoji: "💀", title: "El Desastre", events: ["bola_fuera", "bola_perdida", "remate_red"] },
  { emoji: "🏠", title: "El Techo", events: ["tocaste_techo", "tocaste_techo"] },
  { emoji: "📢", title: "El Gritón", events: ["grito_guerra", "grito_guerra"] },
];
