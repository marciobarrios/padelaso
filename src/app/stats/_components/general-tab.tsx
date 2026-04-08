"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { MatchCard } from "@/components/match/match-card";
import { getEventConfig } from "@/lib/event-config";
import { getRecentForm, type PlayerStats, type FunAwardResult } from "@/lib/stats";
import type { Player, PlayerId, Match, MatchEventType } from "@/lib/types";

function getAwardDescription(events: MatchEventType[]): string {
  return events.map((e) => getEventConfig(e).label).join(" + ");
}

interface GeneralTabProps {
  players: Player[];
  matches: Match[];
  playerMap: Map<PlayerId, Player>;
  allStats: { player: Player; stats: PlayerStats }[];
  mvpRankings: { playerId: PlayerId; count: number }[];
  funAwards: FunAwardResult[];
  selectedPlayer: PlayerId | null;
  selectedPlayerStats: PlayerStats | null;
  playerMatches: Match[];
}

export function GeneralTab({
  players,
  matches,
  playerMap,
  allStats,
  mvpRankings,
  funAwards,
  selectedPlayer,
  selectedPlayerStats,
  playerMatches,
}: GeneralTabProps) {
  const selectedPlayerObj = selectedPlayer
    ? playerMap.get(selectedPlayer)
    : null;

  return (
    <div className="space-y-6 pt-4">
      {/* Personal stats when filtered */}
      {selectedPlayer && selectedPlayerStats && selectedPlayerObj && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <PlayerAvatar emoji={selectedPlayerObj.emoji} size="md" />
              <div>
                <p className="font-medium">{selectedPlayerObj.name}</p>
                <p className="text-xs text-muted-foreground">
                  Estadísticas personales
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-heading font-bold">
                  {selectedPlayerStats.matches}
                </p>
                <p className="text-xs text-muted-foreground">Partidos</p>
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-primary">
                  {selectedPlayerStats.wins}
                </p>
                <p className="text-xs text-muted-foreground">Victorias</p>
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-destructive">
                  {selectedPlayerStats.losses}
                </p>
                <p className="text-xs text-muted-foreground">Derrotas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Win rate leaderboard OR player matches */}
      {selectedPlayer ? (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Partidos
          </h2>
          <div className="space-y-2">
            {playerMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                playerMap={playerMap}
              />
            ))}
          </div>
        </div>
      ) : (
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
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {stats.wins}V {stats.losses}D · {stats.matches}{" "}
                        partidos
                      </p>
                      <RecentFormDots
                        playerId={player.id}
                        matches={matches}
                      />
                    </div>
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
      )}

      {/* MVP Rankings */}
      {mvpRankings.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            🏆 MVP
          </h2>
          <div className="space-y-2">
            {mvpRankings.slice(0, 3).map((mvp, i) => {
              const p = playerMap.get(mvp.playerId);
              if (!p) return null;
              return (
                <Card key={mvp.playerId}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="text-lg font-heading font-bold w-6 text-center text-muted-foreground">
                      {i + 1}
                    </span>
                    <PlayerAvatar emoji={p.emoji} size="sm" />
                    <p className="flex-1 font-medium text-sm truncate">
                      {p.name}
                    </p>
                    <Badge variant="secondary">
                      {mvp.count} voto{mvp.count !== 1 ? "s" : ""}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Fun Awards */}
      {funAwards.some((a) => a.leaderId) && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Premios
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {funAwards.map((award) => {
              const leader = award.leaderId
                ? playerMap.get(award.leaderId)
                : null;
              if (!leader) return null;
              return (
                <Card key={award.title}>
                  <CardContent className="p-3 text-center space-y-1.5">
                    <p className="text-2xl">{award.emoji}</p>
                    <p className="text-xs font-medium">{award.title}</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {getAwardDescription(award.events)}
                    </p>
                    <div className="flex items-center justify-between">
                      {!selectedPlayer ? (
                        <div className="flex items-center gap-1.5">
                          <PlayerAvatar
                            emoji={leader.emoji}
                            size="sm"
                            className="size-5 text-xs"
                          />
                          <span className="text-xs truncate">
                            {leader.name}
                          </span>
                        </div>
                      ) : (
                        <span />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {award.leaderCount}{" "}
                        {award.leaderCount === 1 ? "vez" : "veces"}
                      </span>
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

// ---------- Recent form dots ----------

function RecentFormDots({
  playerId,
  matches,
}: {
  playerId: PlayerId;
  matches: Match[];
}) {
  const form = useMemo(
    () => getRecentForm(playerId, matches),
    [playerId, matches],
  );
  if (form.length === 0) return null;
  return (
    <div className="flex gap-0.5">
      {form.map((result, i) => (
        <span
          key={i}
          className={`size-1.5 rounded-full ${
            result === "W" ? "bg-primary" : "bg-destructive"
          }`}
        />
      ))}
    </div>
  );
}
