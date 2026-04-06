"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileShell } from "@/components/layout/mobile-shell";
import { useMatches, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { MatchCard } from "@/components/match/match-card";
import { buildPlayerMap } from "@/lib/utils";

export default function HomePage() {
  const { activeGroup } = useGroup();
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { players, loaded: playersLoaded } = usePlayers(activeGroup?.id);
  const playerMap = buildPlayerMap(players);

  if (!matchesLoaded || !playersLoaded) return null;

  return (
    <MobileShell>
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-heading">Padelaso</h1>
            <p className="text-sm text-muted-foreground">
              {matches.length} partido{matches.length !== 1 ? "s" : ""} ·{" "}
              {players.length} jugador{players.length !== 1 ? "es" : ""}
            </p>
          </div>
        </div>

        <Link href="/matches/new">
          <Button size="lg" className="w-full text-lg h-14 mb-8">
            <Plus className="size-5 mr-2" />
            Nuevo partido
          </Button>
        </Link>

        {matches.length > 0 ? (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Últimos partidos
            </h2>
            <div className="space-y-6">
              {matches.slice(0, 10).map((match) => (
                <MatchCard key={match.id} match={match} playerMap={playerMap} />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-4">🏓</p>
            <p>No hay partidos todavía.</p>
            <p className="text-sm">¡Crea tu primer partido!</p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
