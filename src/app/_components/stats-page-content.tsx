"use client";

import { useState } from "react";
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
import type { PlayerId, Match, Player, MatchEvent, MatchVote } from "@/lib/types";

import { PlayerFilter } from "@/app/stats/_components/player-filter";
import { GeneralTab } from "@/app/stats/_components/general-tab";
import { ParejasTab } from "@/app/stats/_components/parejas-tab";
import { EventosTab } from "@/app/stats/_components/eventos-tab";
import { StatsPageSkeleton } from "@/components/layout/skeletons";

interface StatsPageContentProps {
  initialMatches: Match[];
  initialPlayers: Player[];
  initialEvents: MatchEvent[];
  initialVotes: MatchVote[];
}

export function StatsPageContent({
  initialMatches,
  initialPlayers,
  initialEvents,
  initialVotes,
}: StatsPageContentProps) {
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id, initialPlayers);
  const { matches, loaded: matchesLoaded } = useMatches(
    activeGroup?.id,
    initialMatches
  );
  const { events } = useAllMatchEvents(activeGroup?.id, initialEvents);
  const { votes } = useAllMatchVotes(activeGroup?.id, initialVotes);

  const [rawSelectedPlayer, setSelectedPlayer] = useState<PlayerId | null>(null);

  // Auto-clear filter if the selected player isn't in the current group
  const selectedPlayer =
    rawSelectedPlayer && players.some((p) => p.id === rawSelectedPlayer)
      ? rawSelectedPlayer
      : null;

  const playerMap = buildPlayerMap(players);

  const filteredEvents = selectedPlayer
    ? events.filter((e) => e.playerId === selectedPlayer)
    : events;

  const allStats = players
    .map((p) => ({
      player: p,
      stats: calculatePlayerStats(p.id, matches),
    }))
    .filter((s) => s.stats.matches > 0)
    .sort((a, b) => b.stats.winRate - a.stats.winRate);

  const leaderboards = getEventLeaderboards(filteredEvents);

  const pairStats = getPairStats(matches);
  const h2hStats = getHeadToHeadStats(matches);
  const mvpRankings = getMvpRankings(votes);
  const funAwards = computeFunAwards(filteredEvents, FUN_AWARD_CONFIGS);

  const filteredPairStats = selectedPlayer
    ? pairStats.filter(
        (p) =>
          p.player1Id === selectedPlayer || p.player2Id === selectedPlayer
      )
    : pairStats;

  const filteredH2H = selectedPlayer
    ? h2hStats.filter(
        (h) =>
          h.pair1.includes(selectedPlayer) || h.pair2.includes(selectedPlayer)
      )
    : h2hStats;

  const selectedPlayerStats = selectedPlayer
    ? allStats.find((s) => s.player.id === selectedPlayer)?.stats ?? null
    : null;

  const playerMatches = selectedPlayer
    ? matches
        .filter(
          (m) =>
            m.team1.includes(selectedPlayer) ||
            m.team2.includes(selectedPlayer)
        )
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        )
    : [];

  if (!matchesLoaded) {
    return (
      <>
        <PageHeader title="Stats" />
        <StatsPageSkeleton />
      </>
    );
  }

  return (
    <>
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
    </>
  );
}
