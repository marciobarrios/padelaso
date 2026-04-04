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
import { EmojiPicker } from "./emoji-picker";
import { updatePlayer } from "@/lib/supabase-mutations";
import { useDataRefresh } from "@/lib/supabase-hooks";
import { Player } from "@/lib/types";

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
  const { refresh } = useDataRefresh();
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
    await updatePlayer(player.id, {
      name: name.trim(),
      emoji,
    });
    refresh();
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
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <Button onClick={handleSave} disabled={!name.trim()} className="w-full">
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
