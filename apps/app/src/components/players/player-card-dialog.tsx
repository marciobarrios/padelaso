"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Match, MatchEvent, Player, PlayerId } from "@padelaso/domain/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerTradingCard } from "./player-trading-card";

const PlayerCardContext = createContext<((id: PlayerId) => void) | null>(null);

export function PlayerCardDialog({
  players,
  matches,
  events,
  period,
  children,
}: {
  players: Player[];
  matches: Match[];
  events: MatchEvent[];
  period: string;
  children: ReactNode;
}) {
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const player = players.find((candidate) => candidate.id === playerId);

  return (
    <Dialog>
      <PlayerCardContext.Provider value={setPlayerId}>
        {children}
      </PlayerCardContext.Provider>
      {player && (
        <DialogContent className="gap-4 p-4 pt-14 motion-reduce:animate-none">
          <DialogTitle className="sr-only">Cromo de {player.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Atributos y rachas de {player.name}. {period}.
          </DialogDescription>
          <PlayerTradingCard player={player} matches={matches} events={events} period={period} />
          <Link className={buttonVariants({ variant: "outline" })} href={`/players/${player.id}`}>
            Ver perfil completo
          </Link>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function PlayerCardTrigger({
  player,
  children,
  className,
}: {
  player: Player;
  children: ReactNode;
  className?: string;
}) {
  const selectPlayer = useContext(PlayerCardContext);
  if (!selectPlayer) throw new Error("PlayerCardTrigger requires PlayerCardDialog");

  return (
    <DialogTrigger
      aria-label={`Ver cromo de ${player.name}`}
      onClick={() => selectPlayer(player.id)}
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-2 rounded-md text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
    </DialogTrigger>
  );
}
