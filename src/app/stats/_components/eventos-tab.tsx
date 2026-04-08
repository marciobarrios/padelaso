"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { getEventConfig } from "@/lib/event-config";
import type { EventLeaderboard } from "@/lib/stats";
import type { Player, PlayerId, MatchEventType } from "@/lib/types";

interface EventosTabProps {
  leaderboards: EventLeaderboard[];
  playerMap: Map<PlayerId, Player>;
  selectedPlayer: PlayerId | null;
}

export function EventosTab({
  leaderboards,
  playerMap,
  selectedPlayer,
}: EventosTabProps) {
  const [expandedEvent, setExpandedEvent] = useState<MatchEventType | null>(
    null,
  );

  if (leaderboards.length === 0) {
    return (
      <div className="pt-4">
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay eventos registrados
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-4">
      {leaderboards.map((lb) => {
        const config = getEventConfig(lb.type);
        const total = lb.entries.reduce((s, e) => s + e.count, 0);

        // Simplified card when filtered by player
        if (selectedPlayer) {
          return (
            <Card key={lb.type}>
              <CardContent className="p-3 flex items-center gap-3">
                <span className="text-2xl">{config.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{config.label}</p>
                </div>
                <Badge variant="secondary">{total}</Badge>
              </CardContent>
            </Card>
          );
        }

        // Full expandable card for "Todos"
        const top = lb.entries[0];
        const topPlayer = playerMap.get(top.playerId);
        const isExpanded = expandedEvent === lb.type;

        return (
          <Card key={lb.type}>
            <CardContent className="p-0">
              <button
                className="w-full p-3 flex items-center gap-3 text-left"
                onClick={() =>
                  setExpandedEvent(isExpanded ? null : lb.type)
                }
              >
                <span className="text-2xl">{config.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {total} total
                  </p>
                </div>
                {topPlayer && (
                  <div className="flex items-center gap-1.5">
                    <PlayerAvatar emoji={topPlayer.emoji} size="sm" />
                    <span className="text-sm font-medium truncate">
                      {topPlayer.name}
                    </span>
                    <Badge variant="secondary">{top.count}</Badge>
                  </div>
                )}
                {isExpanded ? (
                  <ChevronUp className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded — full player list */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{
                  gridTemplateRows: isExpanded ? "1fr" : "0fr",
                }}
              >
                <div className="overflow-hidden">
                  <div className="max-h-48 overflow-y-auto border-t">
                    {lb.entries.map((entry, idx) => {
                      const p = playerMap.get(entry.playerId);
                      if (!p) return null;
                      return (
                        <div
                          key={entry.playerId}
                          className="flex items-center gap-3 px-3 py-2"
                        >
                          <span className="text-sm font-heading font-bold w-5 text-center text-muted-foreground">
                            {idx + 1}
                          </span>
                          <PlayerAvatar
                            emoji={p.emoji}
                            size="sm"
                            className="size-6 text-sm"
                          />
                          <span className="flex-1 text-sm truncate">
                            {p.name}
                          </span>
                          <Badge variant="secondary">{entry.count}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
