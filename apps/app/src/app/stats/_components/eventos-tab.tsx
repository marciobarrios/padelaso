"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerCardTrigger } from "@/components/players/player-card-dialog";
import { getEventConfig } from "@padelaso/domain/events";
import type {
  EventLeaderboard,
  EventLeaderboardEntry,
  EventRecord,
} from "@padelaso/domain/stats";
import type { Player, PlayerId, MatchEventType } from "@padelaso/domain/types";

interface EventosTabProps {
  leaderboards: EventLeaderboard[];
  eventRecords: Map<MatchEventType, EventRecord>;
  playerMap: Map<PlayerId, Player>;
  selectedPlayer: PlayerId | null;
}

function CountRate({ entry }: { entry: EventLeaderboardEntry }) {
  return (
    <div className="flex items-baseline gap-1 tabular-nums shrink-0">
      <span className="text-sm font-medium">{entry.count}</span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground">
        {entry.eligible ? `${entry.perMatch.toFixed(1)}/p` : "—"}
      </span>
    </div>
  );
}

function formatRecordDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function EventosTab({
  leaderboards,
  eventRecords,
  playerMap,
  selectedPlayer,
}: EventosTabProps) {
  const [expandedEvent, setExpandedEvent] = useState<MatchEventType | null>(
    null,
  );

  if (leaderboards.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay eventos registrados
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leaderboards.map((lb) => {
        const config = getEventConfig(lb.type);

        // Simplified card when filtered by player
        if (selectedPlayer) {
          const entry = lb.entries[0];
          if (!entry) return null;
          return (
            <Card key={lb.type}>
              <CardContent className="p-3 flex items-center gap-3">
                <span className="text-2xl">{config.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{config.label}</p>
                </div>
                <CountRate entry={entry} />
              </CardContent>
            </Card>
          );
        }

        // Full expandable card for "Todos"
        const top = lb.entries[0];
        const topPlayer = playerMap.get(top.playerId);
        const isExpanded = expandedEvent === lb.type;
        const record = eventRecords.get(lb.type);
        const recordPlayer = record ? playerMap.get(record.playerId) : null;
        const showRecord = !!record && record.count >= 2 && !!recordPlayer;

        return (
          <Card key={lb.type}>
            <CardContent className="p-0">
              <div className="flex items-center gap-3 p-3">
                <button
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
                  aria-expanded={isExpanded}
                  aria-label={`Clasificación de ${config.label}`}
                  onClick={() => setExpandedEvent(isExpanded ? null : lb.type)}
                >
                  <span className="text-2xl">{config.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{config.label}</span>
                    <span className="block text-xs text-muted-foreground">{lb.totalCount} total</span>
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {topPlayer && (
                  <PlayerCardTrigger player={topPlayer} className="max-w-1/2 gap-1.5">
                    <PlayerAvatar emoji={topPlayer.emoji} size="sm" />
                    <span className="text-sm font-medium truncate">
                      {topPlayer.name}
                    </span>
                    <CountRate entry={top} />
                  </PlayerCardTrigger>
                )}
              </div>

              {/* Expanded — record + full player list */}
              <div
                inert={!isExpanded}
                aria-hidden={!isExpanded}
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{
                  gridTemplateRows: isExpanded ? "1fr" : "0fr",
                }}
              >
                <div className="overflow-hidden">
                  {showRecord && (
                    <div className="px-3 py-2 border-t text-xs text-muted-foreground flex items-center gap-2">
                      <span aria-hidden>🏆</span>
                      <span>
                        Récord:{" "}
                        <PlayerCardTrigger player={recordPlayer} className="inline-flex min-h-0 font-medium text-foreground underline underline-offset-2">
                          {recordPlayer.name}
                        </PlayerCardTrigger>{" "}
                        · {record.count} en un partido (
                        {formatRecordDate(record.date)})
                      </span>
                    </div>
                  )}
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
                          <PlayerCardTrigger player={p} className="flex-1 gap-3">
                            <PlayerAvatar emoji={p.emoji} size="sm" className="size-6 text-sm" />
                            <span className="truncate text-sm">{p.name}</span>
                          </PlayerCardTrigger>
                          <CountRate entry={entry} />
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
