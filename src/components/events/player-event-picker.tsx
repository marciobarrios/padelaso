"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Player, PlayerId, MatchEventType } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { getEventConfig } from "@/lib/event-config";

interface PlayerEventPickerProps {
  open: boolean;
  onClose: () => void;
  eventType: MatchEventType | null;
  players: Player[];
  onSelect: (playerId: PlayerId) => void;
}

export function PlayerEventPicker({
  open,
  onClose,
  eventType,
  players,
  onSelect,
}: PlayerEventPickerProps) {
  const config = eventType ? getEventConfig(eventType) : null;

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-center">
            {config && `${config.emoji} ${config.label}`}
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8">
          <p className="text-sm text-muted-foreground text-center mb-4">
            ¿Quién?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => {
                  onSelect(player.id);
                  onClose();
                }}
                className="flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors active:scale-95"
              >
                <PlayerAvatar emoji={player.emoji} size="lg" />
                <span className="font-medium">{player.name}</span>
              </button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
