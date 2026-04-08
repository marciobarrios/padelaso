"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { MatchCard } from "@/components/match/match-card";
import {
  usePlayers,
  useMatches,
  useAllMatchEvents,
  useAllMatchVotes,
} from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import {
  calculatePlayerStats,
  getEventLeaderboards,
  getPairStats,
  getHeadToHeadStats,
  getRecentForm,
  getMvpRankings,
} from "@/lib/stats";
import { getEventConfig, FUN_AWARD_CONFIGS } from "@/lib/event-config";
import { buildPlayerMap } from "@/lib/utils";
import type { PlayerId, MatchEventType } from "@/lib/types";

function getAwardDescription(events: MatchEventType[]): string {
  return events.map((e) => getEventConfig(e).label).join(" + ");
}

// ---------- Page ----------

export default function StatsPage() {
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { events } = useAllMatchEvents(activeGroup?.id);
  const { votes } = useAllMatchVotes(activeGroup?.id);

  const [expandedEvent, setExpandedEvent] = useState<MatchEventType | null>(
    null,
  );
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerId | null>(null);

  const playerMap = buildPlayerMap(players);

  // Filtered events for player filter
  const filteredEvents = useMemo(
    () =>
      selectedPlayer
        ? events.filter((e) => e.playerId === selectedPlayer)
        : events,
    [events, selectedPlayer],
  );

  // All player stats sorted by win rate
  const allStats = useMemo(
    () =>
      players
        .map((p) => ({
          player: p,
          stats: calculatePlayerStats(p.id, matches),
        }))
        .filter((s) => s.stats.matches > 0)
        .sort((a, b) => b.stats.winRate - a.stats.winRate),
    [players, matches],
  );

  const leaderboards = useMemo(
    () => getEventLeaderboards(filteredEvents),
    [filteredEvents],
  );

  const pairStats = useMemo(() => getPairStats(matches), [matches]);
  const h2hStats = useMemo(() => getHeadToHeadStats(matches), [matches]);
  const mvpRankings = useMemo(() => getMvpRankings(votes), [votes]);

  // Pair stats filtered for selected player
  const filteredPairStats = useMemo(
    () =>
      selectedPlayer
        ? pairStats.filter(
            (p) =>
              p.player1Id === selectedPlayer || p.player2Id === selectedPlayer,
          )
        : pairStats,
    [pairStats, selectedPlayer],
  );

  const filteredH2H = useMemo(
    () =>
      selectedPlayer
        ? h2hStats.filter(
            (h) =>
              h.pair1.includes(selectedPlayer) ||
              h.pair2.includes(selectedPlayer),
          )
        : h2hStats,
    [h2hStats, selectedPlayer],
  );

  // Fun awards: count matches where the player triggered ALL event types in the combo
  const funAwards = useMemo(() => {
    // Group events by matchId+playerId → set of event types
    const byMatchPlayer = new Map<string, Set<MatchEventType>>();
    for (const e of filteredEvents) {
      const key = `${e.matchId}:${e.playerId}`;
      const set = byMatchPlayer.get(key) ?? new Set();
      set.add(e.type);
      byMatchPlayer.set(key, set);
    }

    return FUN_AWARD_CONFIGS.map((award) => {
      const counts = new Map<PlayerId, number>();
      for (const [key, types] of byMatchPlayer) {
        if (award.events.every((t) => types.has(t))) {
          const playerId = key.split(":")[1];
          counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
        }
      }
      let leaderId: PlayerId | null = null;
      let leaderCount = 0;
      for (const [pid, count] of counts) {
        if (count > leaderCount) {
          leaderId = pid;
          leaderCount = count;
        }
      }
      return { ...award, leaderId, leaderCount };
    });
  }, [filteredEvents]);

  // Selected player stats (for filtered General tab)
  const selectedPlayerStats = useMemo(() => {
    if (!selectedPlayer) return null;
    return calculatePlayerStats(selectedPlayer, matches);
  }, [selectedPlayer, matches]);

  const selectedPlayerObj = selectedPlayer
    ? playerMap.get(selectedPlayer)
    : null;

  // Matches involving the selected player, sorted newest first
  const playerMatches = useMemo(
    () =>
      selectedPlayer
        ? matches
            .filter(
              (m) =>
                m.team1.includes(selectedPlayer) ||
                m.team2.includes(selectedPlayer),
            )
            .sort(
              (a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime(),
            )
        : [],
    [matches, selectedPlayer],
  );

  const filterButton = (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted text-sm font-medium transition-colors hover:bg-muted/80">
          {selectedPlayerObj ? (
            <>
              <PlayerAvatar
                emoji={selectedPlayerObj.emoji}
                size="sm"
                className="size-5 text-xs"
              />
              <span className="max-w-[80px] truncate">
                {selectedPlayerObj.name}
              </span>
            </>
          ) : (
            <>
              <Filter className="size-3.5" />
              <span>Todos</span>
            </>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filtrar por jugador</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-1">
          <DrawerClose asChild>
            <button
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                !selectedPlayer
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted"
              }`}
              onClick={() => setSelectedPlayer(null)}
            >
              <div className="size-8 flex items-center justify-center rounded-full bg-muted shrink-0">
                <Filter className="size-4" />
              </div>
              Todos
            </button>
          </DrawerClose>
          {players.map((p) => (
            <DrawerClose key={p.id} asChild>
              <button
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  selectedPlayer === p.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
                onClick={() => setSelectedPlayer(p.id)}
              >
                <PlayerAvatar emoji={p.emoji} size="sm" />
                {p.name}
              </button>
            </DrawerClose>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );

  if (!matchesLoaded)
    return (
      <MobileShell>
        <PageHeader title="Stats" />
      </MobileShell>
    );

  if (matches.length === 0) {
    return (
      <MobileShell>
        <PageHeader title="Stats" />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-2 -mt-20">
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
      <PageHeader title="Stats" action={filterButton} />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Global stats — always visible */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-heading font-bold">
                {matches.length}
              </p>
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

        {/* Tabs */}
        <Tabs defaultValue="general">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="parejas">Parejas</TabsTrigger>
            <TabsTrigger value="eventos">Eventos</TabsTrigger>
          </TabsList>

          {/* ---- General Tab ---- */}
          <TabsContent value="general">
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
                        <p className="text-xs text-muted-foreground">
                          Partidos
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-heading font-bold text-primary">
                          {selectedPlayerStats.wins}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Victorias
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-heading font-bold text-destructive">
                          {selectedPlayerStats.losses}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Derrotas
                        </p>
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
                                {stats.wins}V {stats.losses}D ·{" "}
                                {stats.matches} partidos
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
          </TabsContent>

          {/* ---- Parejas Tab ---- */}
          <TabsContent value="parejas">
            <div className="space-y-6 pt-4">
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

                      // When filtered, show who's the "best" / "worst" partner
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
                            {/* Overlapping avatars */}
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
                            {/* Record bar */}
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
          </TabsContent>

          {/* ---- Eventos Tab ---- */}
          <TabsContent value="eventos">
            <div className="space-y-3 pt-4">
              {leaderboards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay eventos registrados
                </p>
              ) : (
                leaderboards.map((lb) => {
                  const config = getEventConfig(lb.type);
                  const top = lb.entries[0];
                  const topPlayer = playerMap.get(top.playerId);
                  const isExpanded = expandedEvent === lb.type;

                  return (
                    <Card key={lb.type}>
                      <CardContent className="p-0">
                        {/* Collapsed row — always visible */}
                        <button
                          className="w-full p-3 flex items-center gap-3 text-left"
                          onClick={() =>
                            setExpandedEvent(isExpanded ? null : lb.type)
                          }
                        >
                          <span className="text-2xl">{config.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {config.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {lb.entries.reduce((s, e) => s + e.count, 0)}{" "}
                              total
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
                                    <Badge variant="secondary">
                                      {entry.count}
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MobileShell>
  );
}

// ---------- Recent form dots ----------

function RecentFormDots({
  playerId,
  matches,
}: {
  playerId: PlayerId;
  matches: Parameters<typeof getRecentForm>[1];
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
