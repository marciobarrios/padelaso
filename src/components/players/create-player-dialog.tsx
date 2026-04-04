"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { EmojiPicker } from "./emoji-picker";
import { createPlayer } from "@/lib/supabase-mutations";
import { useAuth } from "@/components/auth/auth-provider";
import { useDataRefresh } from "@/lib/supabase-hooks";

export function CreatePlayerDialog() {
  const { user } = useAuth();
  const { refresh } = useDataRefresh();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("😎");

  async function handleCreate() {
    if (!name.trim() || !user) return;
    await createPlayer(name.trim(), emoji, user.id);
    refresh();
    setName("");
    setEmoji("😎");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="icon" variant="ghost" />}>
        <Plus className="size-5" />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo jugador</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <Button onClick={handleCreate} disabled={!name.trim()} className="w-full">
            Crear jugador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
