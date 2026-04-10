"use client";

import { useState, useMemo } from "react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  getMvpRankings,
  computeFunAwards,
} from "@/lib/stats";
import { FUN_AWARD_CONFIGS } from "@/lib/event-config";
import { buildPlayerMap } from "@/lib/utils";
import type { PlayerId } from "@/lib/types";

import { PlayerFilter } from "./_components/player-filter";
import { GeneralTab } from "./_components/general-tab";
import { ParejasTab } from "./_components/parejas-tab";
import { EventosTab } from "./_components/eventos-tab";
import { StatsPageSkeleton } from "@/components/layout/skeletons";

export default function StatsPage() {
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { events } = useAllMatchEvents(activeGroup?.id);
  const { votes } = useAllMatchVotes(activeGroup?.id);

  const [rawSelectedPlayer, setSelectedPlayer] = useState<PlayerId | null>(null);

  // Auto-clear filter if the selected player isn't in the current group
  const selectedPlayer =
    rawSelectedPlayer && players.some((p) => p.id === rawSelectedPlayer)
      ? rawSelectedPlayer
      : null;

  const playerMap = buildPlayerMap(players);

  const filteredEvents = useMemo(
    () =>
      selectedPlayer
        ? events.filter((e) => e.playerId === selectedPlayer)
        : events,
    [events, selectedPlayer],
  );

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
  const funAwards = useMemo(
    () => computeFunAwards(filteredEvents, FUN_AWARD_CONFIGS),
    [filteredEvents],
  );

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

  const selectedPlayerStats = useMemo(() => {
    if (!selectedPlayer) return null;
    return calculatePlayerStats(selectedPlayer, matches);
  }, [selectedPlayer, matches]);

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

  if (!matchesLoaded)
    return (
      <MobileShell>
        <PageHeader title="Stats" />
        <StatsPageSkeleton />
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
      <PageHeader
        title="Stats"
        action={
          <PlayerFilter
            players={players}
            selectedPlayer={selectedPlayer}
            onSelect={setSelectedPlayer}
          />
        }
      />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Tabs */}
        <Tabs defaultValue="general" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="parejas">Parejas</TabsTrigger>
            <TabsTrigger value="eventos">Eventos</TabsTrigger>
          </TabsList>

          {/* Global stats — filtered */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-heading font-bold">
                  {selectedPlayer ? playerMatches.length : matches.length}
                </p>
                <p className="text-xs text-muted-foreground">Partidos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-heading font-bold">
                  {filteredEvents.length}
                </p>
                <p className="text-xs text-muted-foreground">Eventos</p>
              </CardContent>
            </Card>
          </div>

          <TabsContent value="general">
            <GeneralTab
              players={players}
              matches={matches}
              playerMap={playerMap}
              allStats={allStats}
              mvpRankings={mvpRankings}
              funAwards={funAwards}
              selectedPlayer={selectedPlayer}
              selectedPlayerStats={selectedPlayerStats}
              playerMatches={playerMatches}
            />
          </TabsContent>

          <TabsContent value="parejas">
            <ParejasTab
              playerMap={playerMap}
              filteredPairStats={filteredPairStats}
              filteredH2H={filteredH2H}
              selectedPlayer={selectedPlayer}
            />
          </TabsContent>

          <TabsContent value="eventos">
            <EventosTab
              leaderboards={leaderboards}
              playerMap={playerMap}
              selectedPlayer={selectedPlayer}
            />
          </TabsContent>
        </Tabs>
      </div>
    </MobileShell>
  );
}
