"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MatchCard } from "@/components/match/match-card";
import { ScheduledMatchCard } from "@/components/match/scheduled-match-card";
import { useMatches, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { buildPlayerMap, isCompletedMatch, isScheduledMatch } from "@/lib/utils";
import { MatchesListSkeleton } from "@/components/layout/skeletons";

export function MatchesPageContent() {
  const { activeGroup } = useGroup();
  const { matches, loaded: matchesLoaded } = useMatches(activeGroup?.id);
  const { players, loaded: playersLoaded } = usePlayers(activeGroup?.id);
  const playerMap = buildPlayerMap(players);
  const scheduledMatches = matches
    .filter(isScheduledMatch)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completedMatches = matches.filter(isCompletedMatch);

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
        <div className="max-w-lg mx-auto px-4 py-4 space-y-6">
          {matches.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hay partidos todavía
            </p>
          ) : (
            <>
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
                <section>
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Partidos
                  </h2>
                  <div className="space-y-3">
                    {completedMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        playerMap={playerMap}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
