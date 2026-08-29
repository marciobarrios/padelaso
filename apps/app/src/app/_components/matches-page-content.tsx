"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MatchCard } from "@/components/match/match-card";
import { useMatches, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { buildPlayerMap } from "@/lib/utils";
import { MatchesListSkeleton } from "@/components/layout/skeletons";

export function MatchesPageContent() {
  const { activeGroup } = useGroup();
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { players, loaded: playersLoaded } = usePlayers(activeGroup?.id);
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
      {!matchesLoaded || !playersLoaded ? (
        <MatchesListSkeleton />
      ) : (
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
      )}
    </>
  );
}
