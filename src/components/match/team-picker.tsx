"use client";

import { Player, PlayerId } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { cn } from "@/lib/utils";

interface TeamPickerProps {
  players: Player[];
  team1: PlayerId[];
  team2: PlayerId[];
  onToggle: (playerId: PlayerId) => void;
}

export function TeamPicker({ players, team1, team2, onToggle }: TeamPickerProps) {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground text-center">
        Toca un jugador para cambiar de equipo
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Team 1 */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-center text-blue-500">
            Equipo 1
          </h3>
          <div className="space-y-2">
            {team1.map((id) => {
              const p = playerMap.get(id);
              if (!p) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className={cn(
                    "w-full flex items-center gap-2 p-3 rounded-lg border-2 border-blue-500/30 bg-blue-500/10 transition-colors hover:bg-blue-500/20"
                  )}
                >
                  <PlayerAvatar emoji={p.emoji} size="md" />
                  <span className="font-medium text-sm truncate">
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Team 2 */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-center text-orange-500">
            Equipo 2
          </h3>
          <div className="space-y-2">
            {team2.map((id) => {
              const p = playerMap.get(id);
              if (!p) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className={cn(
                    "w-full flex items-center gap-2 p-3 rounded-lg border-2 border-orange-500/30 bg-orange-500/10 transition-colors hover:bg-orange-500/20"
                  )}
                >
                  <PlayerAvatar emoji={p.emoji} size="md" />
                  <span className="font-medium text-sm truncate">
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
