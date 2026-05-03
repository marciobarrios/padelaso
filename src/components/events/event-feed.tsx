"use client";

import { MatchEvent, Player, MatchEventId } from "@/lib/types";
import { getEventConfig } from "@/lib/event-config";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { X } from "lucide-react";

interface EventFeedProps {
  events: MatchEvent[];
  playerMap: Map<string, Player>;
  loaded?: boolean;
  onRemove?: (eventId: MatchEventId) => void;
}

export function EventFeed({
  events,
  playerMap,
  loaded = true,
  onRemove,
}: EventFeedProps) {
  if (!loaded) return null;

  if (events.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-6 text-sm">
        Sin eventos registrados
      </p>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-2">
      {sorted.map((event) => {
        const config = getEventConfig(event.type);
        const player = playerMap.get(event.playerId);
        return (
          <div
            key={event.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30"
          >
            <span className="text-xl">{config.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{config.label}</p>
            </div>
            {player && (
              <div className="flex items-center gap-1.5">
                <PlayerAvatar emoji={player.emoji} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {player.name}
                </span>
              </div>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(event.id)}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
