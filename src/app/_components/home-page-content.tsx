"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MatchCard } from "@/components/match/match-card";
import { ScheduledMatchCard } from "@/components/match/scheduled-match-card";
import { useMatches, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { buildPlayerMap, isCompletedMatch, isScheduledMatch } from "@/lib/utils";
import { HomePageSkeleton } from "@/components/layout/skeletons";

export function HomePageContent() {
  const { activeGroup } = useGroup();
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { players, loaded: playersLoaded } = usePlayers(activeGroup?.id);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const playerMap = buildPlayerMap(players);
  const scheduledMatches = matches
    .filter(isScheduledMatch)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completedMatches = matches.filter(isCompletedMatch);

  if (!matchesLoaded || !playersLoaded) {
    return <HomePageSkeleton />;
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading">Padelaso</h1>
          <p className="text-sm text-muted-foreground">
            {completedMatches.length} partido{completedMatches.length !== 1 ? "s" : ""} ·{" "}
            {scheduledMatches.length} próximo{scheduledMatches.length !== 1 ? "s" : ""} ·{" "}
            {players.length} jugador{players.length !== 1 ? "es" : ""}
          </p>
        </div>
      </div>

      <div className="relative mb-8">
        <div className="flex">
          <Link href="/matches/new" className="flex-1">
            <Button size="lg" className="w-full text-lg h-14 rounded-r-none">
              <Plus className="size-5 mr-2" />
              Nuevo partido
            </Button>
          </Link>
          <Button
            size="lg"
            className="h-14 rounded-l-none border-l border-primary-foreground/25 px-4"
            aria-expanded={newMenuOpen}
            aria-label="Más opciones de partido"
            onClick={() => setNewMenuOpen((open) => !open)}
          >
            <ChevronDown className="size-5" />
          </Button>
        </div>
        {newMenuOpen && (
          <div className="absolute right-0 top-16 z-30 min-w-56 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
            <Link
              href="/matches/plan"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"
              onClick={() => setNewMenuOpen(false)}
            >
              Planificar partido
            </Link>
          </div>
        )}
      </div>

      {matches.length > 0 ? (
        <div className="space-y-6">
          {scheduledMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Próximos
              </h2>
              <div className="space-y-3">
                {scheduledMatches.map((match) => (
                  <ScheduledMatchCard
                    key={match.id}
                    match={match}
                    playerMap={playerMap}
                  />
                ))}
              </div>
            </section>
          )}

          {completedMatches.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Partidos
              </h2>
              <div className="space-y-6">
                {completedMatches.slice(0, 10).map((match) => (
                  <MatchCard key={match.id} match={match} playerMap={playerMap} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-4">🎾</p>
          <p>No hay partidos todavía.</p>
          <p className="text-sm">¡Crea tu primer partido!</p>
        </div>
      )}
    </div>
  );
}
