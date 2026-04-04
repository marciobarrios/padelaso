"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { Player } from "@/lib/types";

const EMOJI_OPTIONS = [
  "😎", "🦁", "🐯", "🦊", "🐻", "🐸", "🦄", "🐙",
  "🎃", "👻", "🤖", "👽", "🧙", "🧛", "🥷", "🏄",
  "⚡", "🌟", "🔥", "💎", "🎯", "🏆", "🎸", "🎭",
];

interface EditPlayerDialogProps {
  player: Player;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPlayerDialog({
  player,
  open,
  onOpenChange,
}: EditPlayerDialogProps) {
  const [name, setName] = useState(player.name);
  const [emoji, setEmoji] = useState(player.emoji);

  useEffect(() => {
    if (open) {
      setName(player.name);
      setEmoji(player.emoji);
    }
  }, [open, player.name, player.emoji]);

  async function handleSave() {
    if (!name.trim()) return;
    await db.players.update(player.id, {
      name: name.trim(),
      emoji,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar jugador</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <div>
            <p className="text-sm text-muted-foreground mb-2">Elige avatar</p>
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`size-10 text-xl rounded-lg flex items-center justify-center transition-colors ${
                    emoji === e
                      ? "bg-primary/20 ring-2 ring-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={!name.trim()} className="w-full">
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
