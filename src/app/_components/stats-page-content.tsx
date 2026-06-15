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
  getEventRecords,
  getPairStats,
  getHeadToHeadStats,
  getMvpRankings,
  computeFunAwards,
} from "@/lib/stats";
import { FUN_AWARD_CONFIGS } from "@/lib/event-config";
import { buildPlayerMap, isCompletedMatch } from "@/lib/utils";
import type { PlayerId } from "@/lib/types";

import { PlayerFilter } from "@/app/stats/_components/player-filter";
import {
  TimeRangeFilter,
  type TimeRange,
} from "@/app/stats/_components/time-range-filter";
import { GeneralTab } from "@/app/stats/_components/general-tab";
import { ParejasTab } from "@/app/stats/_components/parejas-tab";
import { EventosTab } from "@/app/stats/_components/eventos-tab";
import { StatsPageSkeleton } from "@/components/layout/skeletons";

export function StatsPageContent() {
  const { activeGroup } = useGroup();
  const { players, loaded: playersLoaded } = usePlayers(activeGroup?.id);
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { events, loaded: eventsLoaded } = useAllMatchEvents(activeGroup?.id);
  const { votes, loaded: votesLoaded } = useAllMatchVotes(activeGroup?.id);

  const [rawSelectedPlayer, setSelectedPlayer] = useState<PlayerId | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [cutoffMs, setCutoffMs] = useState<number | null>(null);

  const onTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    if (value === "all") {
      setCutoffMs(null);
    } else {
      const days = value === "30d" ? 30 : 90;
      setCutoffMs(Date.now() - days * 86_400_000);
    }
  };

  const selectedPlayer =
    rawSelectedPlayer && players.some((p) => p.id === rawSelectedPlayer)
      ? rawSelectedPlayer
      : null;

  const playerMap = buildPlayerMap(players);
  const completedMatches = matches.filter(isCompletedMatch);

  const timeFilteredMatches =
    cutoffMs == null
      ? completedMatches
      : completedMatches.filter((m) => new Date(m.date).getTime() >= cutoffMs);
  const timeFilteredMatchIds = new Set(timeFilteredMatches.map((m) => m.id));

  const timeFilteredEvents =
    cutoffMs == null
      ? events
      : (() => {
          const ids = new Set(timeFilteredMatches.map((m) => m.id));
          return events.filter((e) => ids.has(e.matchId));
        })();
  const timeFilteredVotes = votes.filter((vote) =>
    timeFilteredMatchIds.has(vote.matchId)
  );

  const filteredEvents = selectedPlayer
    ? timeFilteredEvents.filter((e) => e.playerId === selectedPlayer)
    : timeFilteredEvents;

  const allStats = players
    .map((p) => ({
      player: p,
      stats: calculatePlayerStats(p.id, timeFilteredMatches),
    }))
    .filter((s) => s.stats.matches > 0)
    .sort((a, b) => b.stats.winRate - a.stats.winRate);

  const leaderboards = getEventLeaderboards(filteredEvents, timeFilteredMatches);
  const eventRecords = getEventRecords(timeFilteredEvents, timeFilteredMatches);

  const pairStats = getPairStats(timeFilteredMatches);
  const h2hStats = getHeadToHeadStats(timeFilteredMatches);
  const mvpRankings = getMvpRankings(timeFilteredVotes);
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
    ? timeFilteredMatches
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

  if (!matchesLoaded || !playersLoaded || !eventsLoaded || !votesLoaded) {
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
        <Tabs defaultValue="general" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="parejas">Parejas</TabsTrigger>
            <TabsTrigger value="eventos">Eventos</TabsTrigger>
          </TabsList>

          <TimeRangeFilter value={timeRange} onChange={onTimeRangeChange} />

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-heading font-bold">
                  {selectedPlayer
                    ? playerMatches.length
                    : timeFilteredMatches.length}
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
              matches={timeFilteredMatches}
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
              eventRecords={eventRecords}
              playerMap={playerMap}
              selectedPlayer={selectedPlayer}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
