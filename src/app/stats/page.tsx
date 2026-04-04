"use client";

import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { usePlayers, useMatches } from "@/lib/db-hooks";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  calculatePlayerStats,
  getEventLeaderboards,
} from "@/lib/stats";
import { getEventConfig } from "@/lib/event-config";
import { buildPlayerMap } from "@/lib/utils";

export default function StatsPage() {
  const players = usePlayers();
  const matches = useMatches();
  const events =
    useLiveQuery(() => db.matchEvents.toArray()) ?? [];

  const playerMap = buildPlayerMap(players);

  const allStats = players
    .map((p) => ({
      player: p,
      stats: calculatePlayerStats(p.id, matches),
    }))
    .filter((s) => s.stats.matches > 0)
    .sort((a, b) => b.stats.winRate - a.stats.winRate);

  const leaderboards = getEventLeaderboards(events);

  if (matches.length === 0) {
    return (
      <MobileShell>
        <PageHeader title="Stats" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-4xl">📊</p>
            <p className="text-muted-foreground">
              Juega partidos para ver estadísticas
            </p>
          </div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <PageHeader title="Stats" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {/* Global stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-heading font-bold">{matches.length}</p>
              <p className="text-xs text-muted-foreground">Partidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-heading font-bold">{events.length}</p>
              <p className="text-xs text-muted-foreground">Eventos</p>
            </CardContent>
          </Card>
        </div>

        {/* Win rate leaderboard */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Ranking de victorias
          </h2>
          <div className="space-y-2">
            {allStats.map(({ player, stats }, i) => (
              <Card key={player.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-lg font-heading font-bold w-6 text-center text-muted-foreground">
                    {i + 1}
                  </span>
                  <PlayerAvatar emoji={player.emoji} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {player.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats.wins}V {stats.losses}D · {stats.matches} partidos
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-heading font-bold text-primary">
                      {Math.round(stats.winRate * 100)}%
                    </p>
                    {stats.currentStreak !== 0 && (
                      <p
                        className={`text-xs ${
                          stats.currentStreak > 0
                            ? "text-primary"
                            : "text-destructive"
                        }`}
                      >
                        {stats.currentStreak > 0 ? "🔥" : "💀"}{" "}
                        {Math.abs(stats.currentStreak)} racha
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Event leaderboards */}
        {leaderboards.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Top por evento
            </h2>
            <div className="space-y-3">
              {leaderboards.slice(0, 8).map((lb) => {
                const config = getEventConfig(lb.type);
                const top = lb.entries[0];
                const topPlayer = playerMap.get(top.playerId);
                return (
                  <Card key={lb.type}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-2xl">{config.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {lb.entries.reduce((s, e) => s + e.count, 0)} total
                        </p>
                      </div>
                      {topPlayer && (
                        <div className="flex items-center gap-1.5">
                          <PlayerAvatar
                            emoji={topPlayer.emoji}
                            size="sm"
                          />
                          <Badge variant="secondary">{top.count}</Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
