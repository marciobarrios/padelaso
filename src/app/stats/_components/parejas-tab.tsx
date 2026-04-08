"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/players/player-avatar";
import type { PairStats, HeadToHeadStats } from "@/lib/stats";
import type { Player, PlayerId } from "@/lib/types";

interface ParejasTabProps {
  playerMap: Map<PlayerId, Player>;
  filteredPairStats: PairStats[];
  filteredH2H: HeadToHeadStats[];
  selectedPlayer: PlayerId | null;
}

export function ParejasTab({
  playerMap,
  filteredPairStats,
  filteredH2H,
  selectedPlayer,
}: ParejasTabProps) {
  return (
    <div className="space-y-6">
      {/* Pair rankings */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Ranking de parejas
        </h2>
        {filteredPairStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay datos de parejas todavía
          </p>
        ) : (
          <div className="space-y-2">
            {filteredPairStats.map((pair, i) => {
              const p1 = playerMap.get(pair.player1Id);
              const p2 = playerMap.get(pair.player2Id);
              if (!p1 || !p2) return null;

              const isBestPartner =
                selectedPlayer &&
                i === 0 &&
                filteredPairStats.length > 1;
              const isWorstPartner =
                selectedPlayer &&
                i === filteredPairStats.length - 1 &&
                filteredPairStats.length > 1;

              return (
                <Card
                  key={`${pair.player1Id}-${pair.player2Id}`}
                  className={
                    isBestPartner
                      ? "ring-2 ring-primary"
                      : isWorstPartner
                        ? "ring-2 ring-destructive"
                        : ""
                  }
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="text-lg font-heading font-bold w-6 text-center text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex -space-x-2">
                      <PlayerAvatar emoji={p1.emoji} size="sm" />
                      <PlayerAvatar emoji={p2.emoji} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {p1.name} y {p2.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pair.wins}V {pair.losses}D · {pair.matches}{" "}
                        partidos
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-heading font-bold text-primary">
                        {Math.round(pair.winRate * 100)}%
                      </p>
                      {pair.currentStreak !== 0 && (
                        <p
                          className={`text-xs ${
                            pair.currentStreak > 0
                              ? "text-primary"
                              : "text-destructive"
                          }`}
                        >
                          {pair.currentStreak > 0 ? "🔥" : "💀"}{" "}
                          {Math.abs(pair.currentStreak)} racha
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Rivalries */}
      {filteredH2H.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Rivalidades
          </h2>
          <div className="space-y-2">
            {filteredH2H.slice(0, 10).map((h2h, i) => {
              const p1a = playerMap.get(h2h.pair1[0]);
              const p1b = playerMap.get(h2h.pair1[1]);
              const p2a = playerMap.get(h2h.pair2[0]);
              const p2b = playerMap.get(h2h.pair2[1]);
              if (!p1a || !p1b || !p2a || !p2b) return null;

              const total = h2h.pair1Wins + h2h.pair2Wins;
              const pct1 =
                total > 0 ? (h2h.pair1Wins / total) * 100 : 50;

              return (
                <Card key={i}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5">
                          <PlayerAvatar
                            emoji={p1a.emoji}
                            size="sm"
                            className="size-6 text-xs"
                          />
                          <PlayerAvatar
                            emoji={p1b.emoji}
                            size="sm"
                            className="size-6 text-xs"
                          />
                        </div>
                        <span className="font-medium text-xs truncate max-w-[80px]">
                          {p1a.name} y {p1b.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">
                        {h2h.pair1Wins} - {h2h.pair2Wins}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs truncate max-w-[80px] text-right">
                          {p2a.name} y {p2b.name}
                        </span>
                        <div className="flex -space-x-1.5">
                          <PlayerAvatar
                            emoji={p2a.emoji}
                            size="sm"
                            className="size-6 text-xs"
                          />
                          <PlayerAvatar
                            emoji={p2b.emoji}
                            size="sm"
                            className="size-6 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                      <div
                        className="h-full bg-primary rounded-l-full transition-all"
                        style={{ width: `${pct1}%` }}
                      />
                      <div
                        className="h-full bg-destructive rounded-r-full transition-all"
                        style={{ width: `${100 - pct1}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
