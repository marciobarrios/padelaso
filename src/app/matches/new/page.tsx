"use client";

import { PageHeader } from "@/components/layout/page-header";
import { MatchWizard } from "@/components/match/match-wizard";
import { usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";

export default function NewMatchPage() {
  const { activeGroup } = useGroup();
  const { players, loaded } = usePlayers(activeGroup?.id);

  if (!loaded) return (
    <div className="min-h-dvh flex flex-col">
      <PageHeader title="Nuevo partido" back />
    </div>
  );

  if (players.length < 4) {
    return (
      <div className="min-h-dvh flex flex-col">
        <PageHeader title="Nuevo partido" back />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-2">
            <p className="text-4xl">🎾</p>
            <p className="font-medium">
              Necesitas al menos 4 jugadores
            </p>
            <p className="text-sm text-muted-foreground">
              Ve a Jugadores y añade {4 - players.length} más
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <MatchWizard players={players} groupId={activeGroup?.id} />;
}
