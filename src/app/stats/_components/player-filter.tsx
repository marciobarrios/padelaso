"use client";

import { Filter } from "lucide-react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { PlayerAvatar } from "@/components/players/player-avatar";
import type { Player, PlayerId } from "@/lib/types";

interface PlayerFilterProps {
  players: Player[];
  selectedPlayer: PlayerId | null;
  onSelect: (playerId: PlayerId | null) => void;
}

export function PlayerFilter({
  players,
  selectedPlayer,
  onSelect,
}: PlayerFilterProps) {
  const selectedPlayerObj = selectedPlayer
    ? players.find((p) => p.id === selectedPlayer)
    : null;

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted text-sm font-medium transition-colors hover:bg-muted/80">
          {selectedPlayerObj ? (
            <>
              <PlayerAvatar
                emoji={selectedPlayerObj.emoji}
                size="sm"
                className="size-5 text-xs"
              />
              <span className="max-w-[80px] truncate">
                {selectedPlayerObj.name}
              </span>
            </>
          ) : (
            <>
              <Filter className="size-3.5" />
              <span>Todos</span>
            </>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filtrar por jugador</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-1">
          <DrawerClose asChild>
            <button
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                !selectedPlayer
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted"
              }`}
              onClick={() => onSelect(null)}
            >
              <div className="size-8 flex items-center justify-center rounded-full bg-muted shrink-0">
                <Filter className="size-4" />
              </div>
              Todos
            </button>
          </DrawerClose>
          {players.map((p) => (
            <DrawerClose key={p.id} asChild>
              <button
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  selectedPlayer === p.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
                onClick={() => onSelect(p.id)}
              >
                <PlayerAvatar emoji={p.emoji} size="sm" />
                {p.name}
              </button>
            </DrawerClose>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
