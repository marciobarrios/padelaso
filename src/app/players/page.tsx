"use client";

import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerList } from "@/components/players/player-list";
import { CreatePlayerDialog } from "@/components/players/create-player-dialog";
import { usePlayers } from "@/lib/db-hooks";

export default function PlayersPage() {
  const players = usePlayers();

  return (
    <MobileShell>
      <PageHeader title="Jugadores" action={<CreatePlayerDialog />} />
      <div className="max-w-lg mx-auto">
        <PlayerList players={players} />
      </div>
    </MobileShell>
  );
}
