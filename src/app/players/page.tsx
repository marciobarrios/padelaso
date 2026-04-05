"use client";

import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerList } from "@/components/players/player-list";
import { CreatePlayerDialog } from "@/components/players/create-player-dialog";
import { usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";

export default function PlayersPage() {
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);

  return (
    <MobileShell>
      <PageHeader title="Jugadores" action={<CreatePlayerDialog />} />
      <div className="max-w-lg mx-auto">
        <PlayerList players={players} />
      </div>
    </MobileShell>
  );
}
