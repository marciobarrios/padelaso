"use client";

import Link from "next/link";
import { UserCheck } from "lucide-react";
import { Player } from "@/lib/types";
import { useAuth } from "@/components/auth/auth-provider";
import { PlayerAvatar } from "./player-avatar";

interface PlayerListProps {
  players: Player[];
  loaded?: boolean;
}

export function PlayerList({ players, loaded = true }: PlayerListProps) {
  const { user } = useAuth();

  if (players.length === 0) {
    if (!loaded) return null;
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
          {player.userId === user?.id && (
            <UserCheck className="size-4 text-primary shrink-0" />
          )}
        </Link>
      ))}
    </div>
  );
}
