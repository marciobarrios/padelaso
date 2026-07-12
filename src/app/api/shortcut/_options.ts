import { EVENT_CONFIGS } from "@/lib/event-config";
import type { EventConfig } from "@/lib/event-config";
import type { MatchEventType } from "@/lib/types";

export interface ShortcutPlayerOptionSource {
  id: string;
  name: string;
  emoji: string;
  userId: string | null;
}

export function eventOptionLabel(config: EventConfig): string {
  return `${config.emoji} ${config.label}`;
}

export function buildEventOptions(): Record<string, MatchEventType> {
  return Object.fromEntries(
    EVENT_CONFIGS.map((config) => [eventOptionLabel(config), config.type])
  );
}

export function buildPlayerOptions(
  orderedIds: string[],
  players: ShortcutPlayerOptionSource[],
  currentUserId: string
): Record<string, string> {
  const byId = new Map(players.map((player) => [player.id, player]));
  const options: Record<string, string> = {};

  for (const id of orderedIds) {
    const player = byId.get(id);
    if (!player) continue;
    const self = player.userId === currentUserId;
    let label = `${player.emoji} ${player.name}${self ? " (yo)" : ""}`;
    while (label in options) label += " ²";
    options[label] = id;
  }

  return options;
}
