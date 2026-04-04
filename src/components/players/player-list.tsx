"use client";

import Link from "next/link";
import { UserCheck } from "lucide-react";
import { Player } from "@/lib/types";
import { PlayerAvatar } from "./player-avatar";

interface PlayerListProps {
  players: Player[];
}

export function PlayerList({ players }: PlayerListProps) {
  if (players.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No hay jugadores todavía. ¡Añade el primero!
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {players.map((player) => (
        <Link
          key={player.id}
          href={`/players/${player.id}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <PlayerAvatar emoji={player.emoji} name={player.name} />
          <span className="font-medium flex-1">{player.name}</span>
          {player.userId && (
            <UserCheck className="size-4 text-primary shrink-0" />
          )}
        </Link>
      ))}
    </div>
  );
}
