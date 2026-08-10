"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PlannedMatchWizard } from "@/components/match/planned-match-wizard";
import { usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";

export default function PlanMatchPage() {
  const { activeGroup } = useGroup();
  const { players, loaded } = usePlayers(activeGroup?.id);

  if (!loaded) {
    return (
      <div className="min-h-dvh flex flex-col">
        <PageHeader title="Planificar partido" back />
      </div>
    );
  }

  if (players.length < 4) {
    return (
      <div className="min-h-dvh flex flex-col">
        <PageHeader title="Planificar partido" back />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-2">
            <p className="text-4xl">🎾</p>
            <p className="font-medium">Necesitas al menos 4 jugadores</p>
            <p className="text-sm text-muted-foreground">
              Ve a Jugadores y añade {4 - players.length} más
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <PageHeader title="Planificar partido" back />
      <PlannedMatchWizard players={players} groupId={activeGroup?.id} />
    </div>
  );
}
