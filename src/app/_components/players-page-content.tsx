"use client";

import { PlayerList } from "@/components/players/player-list";
import { CreatePlayerDialog } from "@/components/players/create-player-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { PlayerListSkeleton } from "@/components/layout/skeletons";
import type { Player } from "@/lib/types";

interface PlayersPageContentProps {
  initialPlayers: Player[];
}

export function PlayersPageContent({
  initialPlayers,
}: PlayersPageContentProps) {
  const { activeGroup } = useGroup();
  const { players, loaded } = usePlayers(activeGroup?.id, initialPlayers);

  return (
    <>
      <PageHeader title="Jugadores" action={<CreatePlayerDialog />} />
      <div className="max-w-lg mx-auto">
        {loaded ? <PlayerList players={players} /> : <PlayerListSkeleton />}
      </div>
    </>
  );
}
