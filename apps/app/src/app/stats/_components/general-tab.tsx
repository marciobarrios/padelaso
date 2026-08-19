"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { MatchCard } from "@/components/match/match-card";
import { getEventConfig } from "@padelaso/domain/events";
import {
  getRecentForm,
  MIN_MATCHES_FOR_RANKING,
  type PlayerStats,
  type RankedPlayerStats,
  type FunAwardResult,
} from "@padelaso/domain/stats";
import type { Player, PlayerId, Match, MatchEventType } from "@padelaso/domain/types";

function getAwardDescription(events: MatchEventType[]): string {
  const counts = new Map<MatchEventType, number>();
  for (const e of events) {
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, n]) => {
      const label = getEventConfig(type).label;
      return n > 1 ? `${n}× ${label}` : label;
    })
    .join(" + ");
}

interface GeneralTabProps {
  players: Player[];
  matches: Match[];
  playerMap: Map<PlayerId, Player>;
  allStats: { player: Player; stats: RankedPlayerStats }[];
  mvpRankings: { playerId: PlayerId; count: number }[];
  funAwards: FunAwardResult[];
  selectedPlayer: PlayerId | null;
  selectedPlayerStats: PlayerStats | null;
  playerMatches: Match[];
}

export function GeneralTab({
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
  const establishedStats = allStats.filter(({ stats }) => !stats.provisional);
  const provisionalStats = allStats.filter(({ stats }) => stats.provisional);

  const renderRanking = (
    entries: typeof allStats,
    provisional: boolean,
  ) => (
    <div className="space-y-2">
      {entries.map(({ player, stats }, i) => (
        <Card key={player.id}>
          <CardContent className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 p-3 sm:gap-x-3">
            <span className="w-5 text-center text-lg font-heading font-bold text-muted-foreground sm:w-6">
              {provisional ? "—" : i + 1}
            </span>
            <PlayerAvatar emoji={player.emoji} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{player.name}</p>
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-xs text-muted-foreground">
                  {stats.wins}V {stats.losses}D · {stats.matches} partidos
                </p>
                <RecentFormDots playerId={player.id} matches={matches} />
              </div>
            </div>
            <div className="ml-0.5 shrink-0 text-right">
              <p className="flex items-baseline justify-end gap-1 tabular-nums">
                <span className="text-xs text-muted-foreground">Índice</span>
                <span className="text-base font-semibold text-foreground">
                  {Math.round(stats.rankingScore * 100)}
                </span>
              </p>
              <p className="flex items-center justify-end gap-1.5 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                <span
                  aria-label={`${Math.round(stats.winRate * 100)}% de victorias`}
                >
                  <span aria-hidden="true">
                    {Math.round(stats.winRate * 100)}%V
                  </span>
                </span>
                {stats.currentStreak !== 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      aria-label={`Racha de ${Math.abs(stats.currentStreak)} ${
                        stats.currentStreak > 0 ? "victorias" : "derrotas"
                      }`}
                      className={
                        stats.currentStreak > 0
                          ? "text-primary"
                          : "text-destructive"
                      }
                    >
                      <span aria-hidden="true">
                        {stats.currentStreak > 0 ? "🔥" : "💀"}{" "}
                        {Math.abs(stats.currentStreak)}
                      </span>
                    </span>
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
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

      {/* Logros */}
      {funAwards.some((a) => a.leaders.length > 0) && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Logros
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {funAwards.map((award) => {
              if (award.leaders.length === 0) return null;
              return (
                <Card key={award.title}>
                  <CardContent className="p-3 text-center space-y-1.5">
                    <p className="text-2xl">{award.emoji}</p>
                    <p className="text-xs font-medium">{award.title}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {getAwardDescription(award.events)}
                    </p>
                    <div className="space-y-1">
                      {award.leaders.map((leader) => {
                        const player = playerMap.get(leader.playerId);
                        if (!player) return null;
                        return (
                          <div
                            key={leader.playerId}
                            className="flex items-center justify-between"
                          >
                            {!selectedPlayer ? (
                              <div className="flex items-center gap-1.5">
                                <PlayerAvatar
                                  emoji={player.emoji}
                                  size="sm"
                                  className="size-5 text-xs"
                                />
                                <span className="text-xs truncate">
                                  {player.name}
                                </span>
                              </div>
                            ) : (
                              <span />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {leader.count}{" "}
                              {leader.count === 1 ? "vez" : "veces"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
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
                highlightPlayerId={selectedPlayer ?? undefined}
              />
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Ranking de rendimiento
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            El índice ajusta el % de victorias al promedio del grupo. Con pocos
            partidos pesa más el promedio; cuantos más se juegan, más se acerca
            al % real.
          </p>
          {establishedStats.length > 0 && renderRanking(establishedStats, false)}
          {provisionalStats.length > 0 && (
            <div className={establishedStats.length > 0 ? "mt-5" : undefined}>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Provisionales · menos de {MIN_MATCHES_FOR_RANKING} partidos
              </p>
              {renderRanking(provisionalStats, true)}
            </div>
          )}
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
    <div className="flex shrink-0 gap-0.5">
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
