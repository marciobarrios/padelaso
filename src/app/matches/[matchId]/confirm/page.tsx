"use client";

import { use } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ScheduledMatchConfirmWizard } from "@/components/match/scheduled-match-confirm-wizard";
import { useMatch, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";

export default function ConfirmScheduledMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { activeGroup } = useGroup();
  const { matchId } = use(params);
  const { match, loaded: matchLoaded } = useMatch(matchId);
  const { players, loaded: playersLoaded } = usePlayers(activeGroup?.id);

  if (!matchLoaded || !playersLoaded) {
    return (
      <div className="min-h-dvh flex flex-col">
        <PageHeader title="Confirmar partido" backHref={`/matches/${matchId}`} />
      </div>
    );
  }

  if (!match || match.status !== "scheduled") {
    return (
      <div className="min-h-dvh flex flex-col">
        <PageHeader title="Confirmar partido" backHref={`/matches/${matchId}`} />
        <p className="text-center py-12 text-muted-foreground">
          Partido planificado no encontrado
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <PageHeader title="Confirmar partido" backHref={`/matches/${matchId}`} />
      <ScheduledMatchConfirmWizard match={match} players={players} />
    </div>
  );
}
