"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MatchCard } from "@/components/match/match-card";
import { useMatches, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { buildPlayerMap } from "@/lib/utils";
import type { Match, Player } from "@/lib/types";

interface MatchesPageContentProps {
  initialMatches: Match[];
  initialPlayers: Player[];
}

export function MatchesPageContent({
  initialMatches,
  initialPlayers,
}: MatchesPageContentProps) {
  const { activeGroup } = useGroup();
  const { matches } = useMatches(activeGroup?.id, initialMatches);
  const { players } = usePlayers(activeGroup?.id, initialPlayers);
  const playerMap = buildPlayerMap(players);

  return (
    <>
      <PageHeader
        title="Partidos"
        action={
          <Link href="/matches/new">
            <Button size="icon" variant="ghost">
              <Plus className="size-5" />
            </Button>
          </Link>
        }
      />
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {matches.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No hay partidos todavía
          </p>
        ) : (
          matches.map((match) => (
            <MatchCard key={match.id} match={match} playerMap={playerMap} />
          ))
        )}
      </div>
    </>
  );
}
