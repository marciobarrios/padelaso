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
import { db } from "@/lib/db";

const EMOJI_OPTIONS = [
  "😎", "🦁", "🐯", "🦊", "🐻", "🐸", "🦄", "🐙",
  "🎃", "👻", "🤖", "👽", "🧙", "🧛", "🥷", "🏄",
  "⚡", "🌟", "🔥", "💎", "🎯", "🏆", "🎸", "🎭",
];

export function CreatePlayerDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("😎");

  async function handleCreate() {
    if (!name.trim()) return;
    await db.players.add({
      id: crypto.randomUUID(),
      name: name.trim(),
      emoji,
      createdAt: new Date(),
    });
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
          <Button onClick={handleCreate} disabled={!name.trim()} className="w-full">
            Crear jugador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
