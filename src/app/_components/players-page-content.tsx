"use client";

import { PlayerList } from "@/components/players/player-list";
import { CreatePlayerDialog } from "@/components/players/create-player-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { PlayerListSkeleton } from "@/components/layout/skeletons";

export function PlayersPageContent() {
  const { activeGroup } = useGroup();
  const { players, loaded } = usePlayers(activeGroup?.id);

  return (
    <>
      <PageHeader title="Jugadores" action={<CreatePlayerDialog />} />
      <div className="max-w-lg mx-auto">
        {loaded ? <PlayerList players={players} /> : <PlayerListSkeleton />}
      </div>
    </>
  );
}
